(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Performance_type_skeleton =   {
    "name": "Performance.type",
    "ctorName": "Performance",
    "instanceName": "",
    "brand": "Performance",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": "EventTarget",
    "props": {
      "timeOrigin": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Performance",
            "propName": "timeOrigin",
            "callType": "get"
          }
        }
      },
      "onresourcetimingbufferfull": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Performance",
            "propName": "onresourcetimingbufferfull",
            "callType": "get"
          },
          "setter": {
            "objName": "Performance",
            "propName": "onresourcetimingbufferfull",
            "callType": "set"
          }
        }
      },
      "clearMarks": {
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
          "objName": "Performance",
          "propName": "clearMarks",
          "callType": "apply"
        }
      },
      "clearMeasures": {
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
          "objName": "Performance",
          "propName": "clearMeasures",
          "callType": "apply"
        }
      },
      "clearResourceTimings": {
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
          "objName": "Performance",
          "propName": "clearResourceTimings",
          "callType": "apply"
        }
      },
      "getEntries": {
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
          "objName": "Performance",
          "propName": "getEntries",
          "callType": "apply"
        }
      },
      "getEntriesByName": {
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
          "objName": "Performance",
          "propName": "getEntriesByName",
          "callType": "apply"
        }
      },
      "getEntriesByType": {
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
          "objName": "Performance",
          "propName": "getEntriesByType",
          "callType": "apply"
        }
      },
      "mark": {
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
          "objName": "Performance",
          "propName": "mark",
          "callType": "apply"
        }
      },
      "measure": {
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
          "objName": "Performance",
          "propName": "measure",
          "callType": "apply"
        }
      },
      "setResourceTimingBufferSize": {
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
          "objName": "Performance",
          "propName": "setResourceTimingBufferSize",
          "callType": "apply"
        }
      },
      "toJSON": {
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
          "objName": "Performance",
          "propName": "toJSON",
          "callType": "apply"
        }
      },
      "now": {
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
          "objName": "Performance",
          "propName": "now",
          "callType": "apply"
        }
      },
      "timing": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Performance",
            "propName": "timing",
            "callType": "get"
          }
        }
      },
      "navigation": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Performance",
            "propName": "navigation",
            "callType": "get"
          }
        }
      },
      "memory": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Performance",
            "propName": "memory",
            "callType": "get"
          }
        }
      },
      "eventCounts": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Performance",
            "propName": "eventCounts",
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
        "value": "Performance"
      }
    }
  };  leapenv.skeletonObjects.push(Performance_type_skeleton);})(globalThis);
