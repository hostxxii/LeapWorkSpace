(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const Element_type_skeleton =   {
    "name": "Element.type",
    "ctorName": "Element",
    "instanceName": "",
    "brand": "Element",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": "Node",
    "props": {
      "namespaceURI": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "namespaceURI",
            "callType": "get"
          }
        }
      },
      "prefix": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "prefix",
            "callType": "get"
          }
        }
      },
      "localName": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "localName",
            "callType": "get"
          }
        }
      },
      "tagName": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "tagName",
            "callType": "get"
          }
        }
      },
      "id": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "id",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "id",
            "callType": "set"
          }
        }
      },
      "className": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "className",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "className",
            "callType": "set"
          }
        }
      },
      "classList": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "classList",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "classList",
            "callType": "set"
          }
        }
      },
      "slot": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "slot",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "slot",
            "callType": "set"
          }
        }
      },
      "attributes": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "attributes",
            "callType": "get"
          }
        }
      },
      "shadowRoot": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "shadowRoot",
            "callType": "get"
          }
        }
      },
      "part": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "part",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "part",
            "callType": "set"
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
            "objName": "Element",
            "propName": "assignedSlot",
            "callType": "get"
          }
        }
      },
      "innerHTML": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "innerHTML",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "innerHTML",
            "callType": "set"
          }
        }
      },
      "outerHTML": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "outerHTML",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "outerHTML",
            "callType": "set"
          }
        }
      },
      "scrollTop": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "scrollTop",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "scrollTop",
            "callType": "set"
          }
        }
      },
      "scrollLeft": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "scrollLeft",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "scrollLeft",
            "callType": "set"
          }
        }
      },
      "scrollWidth": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "scrollWidth",
            "callType": "get"
          }
        }
      },
      "scrollHeight": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "scrollHeight",
            "callType": "get"
          }
        }
      },
      "clientTop": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "clientTop",
            "callType": "get"
          }
        }
      },
      "clientLeft": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "clientLeft",
            "callType": "get"
          }
        }
      },
      "clientWidth": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "clientWidth",
            "callType": "get"
          }
        }
      },
      "clientHeight": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "clientHeight",
            "callType": "get"
          }
        }
      },
      "onbeforecopy": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "onbeforecopy",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "onbeforecopy",
            "callType": "set"
          }
        }
      },
      "onbeforecut": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "onbeforecut",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "onbeforecut",
            "callType": "set"
          }
        }
      },
      "onbeforepaste": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "onbeforepaste",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "onbeforepaste",
            "callType": "set"
          }
        }
      },
      "onsearch": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "onsearch",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "onsearch",
            "callType": "set"
          }
        }
      },
      "elementTiming": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "elementTiming",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "elementTiming",
            "callType": "set"
          }
        }
      },
      "onfullscreenchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "onfullscreenchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "onfullscreenchange",
            "callType": "set"
          }
        }
      },
      "onfullscreenerror": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "onfullscreenerror",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "onfullscreenerror",
            "callType": "set"
          }
        }
      },
      "onwebkitfullscreenchange": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "onwebkitfullscreenchange",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "onwebkitfullscreenchange",
            "callType": "set"
          }
        }
      },
      "onwebkitfullscreenerror": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "onwebkitfullscreenerror",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "onwebkitfullscreenerror",
            "callType": "set"
          }
        }
      },
      "role": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "role",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "role",
            "callType": "set"
          }
        }
      },
      "ariaAtomic": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaAtomic",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaAtomic",
            "callType": "set"
          }
        }
      },
      "ariaAutoComplete": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaAutoComplete",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaAutoComplete",
            "callType": "set"
          }
        }
      },
      "ariaBusy": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaBusy",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaBusy",
            "callType": "set"
          }
        }
      },
      "ariaBrailleLabel": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaBrailleLabel",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaBrailleLabel",
            "callType": "set"
          }
        }
      },
      "ariaBrailleRoleDescription": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaBrailleRoleDescription",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaBrailleRoleDescription",
            "callType": "set"
          }
        }
      },
      "ariaChecked": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaChecked",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaChecked",
            "callType": "set"
          }
        }
      },
      "ariaColCount": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaColCount",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaColCount",
            "callType": "set"
          }
        }
      },
      "ariaColIndex": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaColIndex",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaColIndex",
            "callType": "set"
          }
        }
      },
      "ariaColSpan": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaColSpan",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaColSpan",
            "callType": "set"
          }
        }
      },
      "ariaCurrent": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaCurrent",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaCurrent",
            "callType": "set"
          }
        }
      },
      "ariaDescription": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaDescription",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaDescription",
            "callType": "set"
          }
        }
      },
      "ariaDisabled": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaDisabled",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaDisabled",
            "callType": "set"
          }
        }
      },
      "ariaExpanded": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaExpanded",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaExpanded",
            "callType": "set"
          }
        }
      },
      "ariaHasPopup": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaHasPopup",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaHasPopup",
            "callType": "set"
          }
        }
      },
      "ariaHidden": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaHidden",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaHidden",
            "callType": "set"
          }
        }
      },
      "ariaInvalid": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaInvalid",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaInvalid",
            "callType": "set"
          }
        }
      },
      "ariaKeyShortcuts": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaKeyShortcuts",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaKeyShortcuts",
            "callType": "set"
          }
        }
      },
      "ariaLabel": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaLabel",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaLabel",
            "callType": "set"
          }
        }
      },
      "ariaLevel": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaLevel",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaLevel",
            "callType": "set"
          }
        }
      },
      "ariaLive": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaLive",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaLive",
            "callType": "set"
          }
        }
      },
      "ariaModal": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaModal",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaModal",
            "callType": "set"
          }
        }
      },
      "ariaMultiLine": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaMultiLine",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaMultiLine",
            "callType": "set"
          }
        }
      },
      "ariaMultiSelectable": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaMultiSelectable",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaMultiSelectable",
            "callType": "set"
          }
        }
      },
      "ariaOrientation": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaOrientation",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaOrientation",
            "callType": "set"
          }
        }
      },
      "ariaPlaceholder": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaPlaceholder",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaPlaceholder",
            "callType": "set"
          }
        }
      },
      "ariaPosInSet": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaPosInSet",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaPosInSet",
            "callType": "set"
          }
        }
      },
      "ariaPressed": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaPressed",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaPressed",
            "callType": "set"
          }
        }
      },
      "ariaReadOnly": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaReadOnly",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaReadOnly",
            "callType": "set"
          }
        }
      },
      "ariaRelevant": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaRelevant",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaRelevant",
            "callType": "set"
          }
        }
      },
      "ariaRequired": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaRequired",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaRequired",
            "callType": "set"
          }
        }
      },
      "ariaRoleDescription": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaRoleDescription",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaRoleDescription",
            "callType": "set"
          }
        }
      },
      "ariaRowCount": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaRowCount",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaRowCount",
            "callType": "set"
          }
        }
      },
      "ariaRowIndex": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaRowIndex",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaRowIndex",
            "callType": "set"
          }
        }
      },
      "ariaRowSpan": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaRowSpan",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaRowSpan",
            "callType": "set"
          }
        }
      },
      "ariaSelected": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaSelected",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaSelected",
            "callType": "set"
          }
        }
      },
      "ariaSetSize": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaSetSize",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaSetSize",
            "callType": "set"
          }
        }
      },
      "ariaSort": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaSort",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaSort",
            "callType": "set"
          }
        }
      },
      "ariaValueMax": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaValueMax",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaValueMax",
            "callType": "set"
          }
        }
      },
      "ariaValueMin": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaValueMin",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaValueMin",
            "callType": "set"
          }
        }
      },
      "ariaValueNow": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaValueNow",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaValueNow",
            "callType": "set"
          }
        }
      },
      "ariaValueText": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaValueText",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaValueText",
            "callType": "set"
          }
        }
      },
      "children": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "children",
            "callType": "get"
          }
        }
      },
      "firstElementChild": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "firstElementChild",
            "callType": "get"
          }
        }
      },
      "lastElementChild": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "lastElementChild",
            "callType": "get"
          }
        }
      },
      "childElementCount": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "childElementCount",
            "callType": "get"
          }
        }
      },
      "previousElementSibling": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "previousElementSibling",
            "callType": "get"
          }
        }
      },
      "nextElementSibling": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "nextElementSibling",
            "callType": "get"
          }
        }
      },
      "after": {
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
          "objName": "Element",
          "propName": "after",
          "callType": "apply"
        }
      },
      "animate": {
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
          "objName": "Element",
          "propName": "animate",
          "callType": "apply"
        }
      },
      "append": {
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
          "objName": "Element",
          "propName": "append",
          "callType": "apply"
        }
      },
      "attachShadow": {
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
          "objName": "Element",
          "propName": "attachShadow",
          "callType": "apply"
        }
      },
      "before": {
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
          "objName": "Element",
          "propName": "before",
          "callType": "apply"
        }
      },
      "checkVisibility": {
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
          "objName": "Element",
          "propName": "checkVisibility",
          "callType": "apply"
        }
      },
      "closest": {
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
          "objName": "Element",
          "propName": "closest",
          "callType": "apply"
        }
      },
      "computedStyleMap": {
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
          "objName": "Element",
          "propName": "computedStyleMap",
          "callType": "apply"
        }
      },
      "getAnimations": {
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
          "objName": "Element",
          "propName": "getAnimations",
          "callType": "apply"
        }
      },
      "getAttribute": {
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
          "objName": "Element",
          "propName": "getAttribute",
          "callType": "apply"
        }
      },
      "getAttributeNS": {
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
          "objName": "Element",
          "propName": "getAttributeNS",
          "callType": "apply"
        }
      },
      "getAttributeNames": {
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
          "objName": "Element",
          "propName": "getAttributeNames",
          "callType": "apply"
        }
      },
      "getAttributeNode": {
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
          "objName": "Element",
          "propName": "getAttributeNode",
          "callType": "apply"
        }
      },
      "getAttributeNodeNS": {
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
          "objName": "Element",
          "propName": "getAttributeNodeNS",
          "callType": "apply"
        }
      },
      "getBoundingClientRect": {
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
          "objName": "Element",
          "propName": "getBoundingClientRect",
          "callType": "apply"
        }
      },
      "getClientRects": {
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
          "objName": "Element",
          "propName": "getClientRects",
          "callType": "apply"
        }
      },
      "getElementsByClassName": {
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
          "objName": "Element",
          "propName": "getElementsByClassName",
          "callType": "apply"
        }
      },
      "getElementsByTagName": {
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
          "objName": "Element",
          "propName": "getElementsByTagName",
          "callType": "apply"
        }
      },
      "getElementsByTagNameNS": {
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
          "objName": "Element",
          "propName": "getElementsByTagNameNS",
          "callType": "apply"
        }
      },
      "getHTML": {
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
          "objName": "Element",
          "propName": "getHTML",
          "callType": "apply"
        }
      },
      "hasAttribute": {
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
          "objName": "Element",
          "propName": "hasAttribute",
          "callType": "apply"
        }
      },
      "hasAttributeNS": {
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
          "objName": "Element",
          "propName": "hasAttributeNS",
          "callType": "apply"
        }
      },
      "hasAttributes": {
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
          "objName": "Element",
          "propName": "hasAttributes",
          "callType": "apply"
        }
      },
      "hasPointerCapture": {
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
          "objName": "Element",
          "propName": "hasPointerCapture",
          "callType": "apply"
        }
      },
      "insertAdjacentElement": {
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
          "objName": "Element",
          "propName": "insertAdjacentElement",
          "callType": "apply"
        }
      },
      "insertAdjacentHTML": {
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
          "objName": "Element",
          "propName": "insertAdjacentHTML",
          "callType": "apply"
        }
      },
      "insertAdjacentText": {
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
          "objName": "Element",
          "propName": "insertAdjacentText",
          "callType": "apply"
        }
      },
      "matches": {
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
          "objName": "Element",
          "propName": "matches",
          "callType": "apply"
        }
      },
      "moveBefore": {
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
          "objName": "Element",
          "propName": "moveBefore",
          "callType": "apply"
        }
      },
      "prepend": {
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
          "objName": "Element",
          "propName": "prepend",
          "callType": "apply"
        }
      },
      "querySelector": {
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
          "objName": "Element",
          "propName": "querySelector",
          "callType": "apply"
        }
      },
      "querySelectorAll": {
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
          "objName": "Element",
          "propName": "querySelectorAll",
          "callType": "apply"
        }
      },
      "releasePointerCapture": {
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
          "objName": "Element",
          "propName": "releasePointerCapture",
          "callType": "apply"
        }
      },
      "remove": {
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
          "objName": "Element",
          "propName": "remove",
          "callType": "apply"
        }
      },
      "removeAttribute": {
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
          "objName": "Element",
          "propName": "removeAttribute",
          "callType": "apply"
        }
      },
      "removeAttributeNS": {
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
          "objName": "Element",
          "propName": "removeAttributeNS",
          "callType": "apply"
        }
      },
      "removeAttributeNode": {
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
          "objName": "Element",
          "propName": "removeAttributeNode",
          "callType": "apply"
        }
      },
      "replaceChildren": {
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
          "objName": "Element",
          "propName": "replaceChildren",
          "callType": "apply"
        }
      },
      "replaceWith": {
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
          "objName": "Element",
          "propName": "replaceWith",
          "callType": "apply"
        }
      },
      "requestFullscreen": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Element",
          "propName": "requestFullscreen",
          "callType": "apply"
        }
      },
      "requestPointerLock": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Element",
          "propName": "requestPointerLock",
          "callType": "apply"
        }
      },
      "scroll": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Element",
          "propName": "scroll",
          "callType": "apply"
        }
      },
      "scrollBy": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Element",
          "propName": "scrollBy",
          "callType": "apply"
        }
      },
      "scrollIntoView": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Element",
          "propName": "scrollIntoView",
          "callType": "apply"
        }
      },
      "scrollIntoViewIfNeeded": {
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
          "objName": "Element",
          "propName": "scrollIntoViewIfNeeded",
          "callType": "apply"
        }
      },
      "scrollTo": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 0,
        "brandCheck": false,
        "dispatch": {
          "objName": "Element",
          "propName": "scrollTo",
          "callType": "apply"
        }
      },
      "setAttribute": {
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
          "objName": "Element",
          "propName": "setAttribute",
          "callType": "apply"
        }
      },
      "setAttributeNS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 3,
        "brandCheck": true,
        "dispatch": {
          "objName": "Element",
          "propName": "setAttributeNS",
          "callType": "apply"
        }
      },
      "setAttributeNode": {
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
          "objName": "Element",
          "propName": "setAttributeNode",
          "callType": "apply"
        }
      },
      "setAttributeNodeNS": {
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
          "objName": "Element",
          "propName": "setAttributeNodeNS",
          "callType": "apply"
        }
      },
      "setHTMLUnsafe": {
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
          "objName": "Element",
          "propName": "setHTMLUnsafe",
          "callType": "apply"
        }
      },
      "setPointerCapture": {
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
          "objName": "Element",
          "propName": "setPointerCapture",
          "callType": "apply"
        }
      },
      "toggleAttribute": {
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
          "objName": "Element",
          "propName": "toggleAttribute",
          "callType": "apply"
        }
      },
      "webkitMatchesSelector": {
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
          "objName": "Element",
          "propName": "webkitMatchesSelector",
          "callType": "apply"
        }
      },
      "webkitRequestFullScreen": {
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
          "objName": "Element",
          "propName": "webkitRequestFullScreen",
          "callType": "apply"
        }
      },
      "webkitRequestFullscreen": {
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
          "objName": "Element",
          "propName": "webkitRequestFullscreen",
          "callType": "apply"
        }
      },
      "currentCSSZoom": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "currentCSSZoom",
            "callType": "get"
          }
        }
      },
      "ariaColIndexText": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaColIndexText",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaColIndexText",
            "callType": "set"
          }
        }
      },
      "ariaRowIndexText": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaRowIndexText",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaRowIndexText",
            "callType": "set"
          }
        }
      },
      "ariaActiveDescendantElement": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaActiveDescendantElement",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaActiveDescendantElement",
            "callType": "set"
          }
        }
      },
      "ariaControlsElements": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaControlsElements",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaControlsElements",
            "callType": "set"
          }
        }
      },
      "ariaDescribedByElements": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaDescribedByElements",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaDescribedByElements",
            "callType": "set"
          }
        }
      },
      "ariaDetailsElements": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaDetailsElements",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaDetailsElements",
            "callType": "set"
          }
        }
      },
      "ariaErrorMessageElements": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaErrorMessageElements",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaErrorMessageElements",
            "callType": "set"
          }
        }
      },
      "ariaFlowToElements": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaFlowToElements",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaFlowToElements",
            "callType": "set"
          }
        }
      },
      "ariaLabelledByElements": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "Element",
            "propName": "ariaLabelledByElements",
            "callType": "get"
          },
          "setter": {
            "objName": "Element",
            "propName": "ariaLabelledByElements",
            "callType": "set"
          }
        }
      },
      "ariaNotify": {
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
          "objName": "Element",
          "propName": "ariaNotify",
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
        "value": "Element"
      },
      "@@unscopables": {
        "owner": "prototype",
        "attributes": {
          "enumerable": false,
          "configurable": true,
          "writable": false
        },
        "kind": "data",
        "valueType": "undefined",
        "value": "undefined"
      }
    }
  };  leapenv.skeletonObjects.push(Element_type_skeleton);})(globalThis);
