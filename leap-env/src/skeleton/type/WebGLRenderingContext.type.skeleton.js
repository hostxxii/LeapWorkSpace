(function (global) {  const leapenv = global.leapenv || (global.leapenv = {});  leapenv.skeletonObjects = leapenv.skeletonObjects || [];  const WebGLRenderingContext_type_skeleton =   {
    "name": "WebGLRenderingContext.type",
    "ctorName": "WebGLRenderingContext",
    "instanceName": "",
    "brand": "WebGLRenderingContext",
    "ctorIllegal": true,
    "exposeCtor": true,
    "super": null,
    "props": {
      "DEPTH_BUFFER_BIT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "256"
      },
      "STENCIL_BUFFER_BIT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1024"
      },
      "COLOR_BUFFER_BIT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "16384"
      },
      "POINTS": {
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
      "LINES": {
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
      "LINE_LOOP": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2"
      },
      "LINE_STRIP": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3"
      },
      "TRIANGLES": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "4"
      },
      "TRIANGLE_STRIP": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5"
      },
      "TRIANGLE_FAN": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "6"
      },
      "ZERO": {
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
      "ONE": {
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
      "SRC_COLOR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "768"
      },
      "ONE_MINUS_SRC_COLOR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "769"
      },
      "SRC_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "770"
      },
      "ONE_MINUS_SRC_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "771"
      },
      "DST_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "772"
      },
      "ONE_MINUS_DST_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "773"
      },
      "DST_COLOR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "774"
      },
      "ONE_MINUS_DST_COLOR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "775"
      },
      "SRC_ALPHA_SATURATE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "776"
      },
      "FUNC_ADD": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32774"
      },
      "BLEND_EQUATION": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32777"
      },
      "BLEND_EQUATION_RGB": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32777"
      },
      "BLEND_EQUATION_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34877"
      },
      "FUNC_SUBTRACT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32778"
      },
      "FUNC_REVERSE_SUBTRACT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32779"
      },
      "BLEND_DST_RGB": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32968"
      },
      "BLEND_SRC_RGB": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32969"
      },
      "BLEND_DST_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32970"
      },
      "BLEND_SRC_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32971"
      },
      "CONSTANT_COLOR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32769"
      },
      "ONE_MINUS_CONSTANT_COLOR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32770"
      },
      "CONSTANT_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32771"
      },
      "ONE_MINUS_CONSTANT_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32772"
      },
      "BLEND_COLOR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32773"
      },
      "ARRAY_BUFFER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34962"
      },
      "ELEMENT_ARRAY_BUFFER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34963"
      },
      "ARRAY_BUFFER_BINDING": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34964"
      },
      "ELEMENT_ARRAY_BUFFER_BINDING": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34965"
      },
      "STREAM_DRAW": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35040"
      },
      "STATIC_DRAW": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35044"
      },
      "DYNAMIC_DRAW": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35048"
      },
      "BUFFER_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34660"
      },
      "BUFFER_USAGE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34661"
      },
      "CURRENT_VERTEX_ATTRIB": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34342"
      },
      "FRONT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1028"
      },
      "BACK": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1029"
      },
      "FRONT_AND_BACK": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1032"
      },
      "TEXTURE_2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3553"
      },
      "CULL_FACE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2884"
      },
      "BLEND": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3042"
      },
      "DITHER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3024"
      },
      "STENCIL_TEST": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2960"
      },
      "DEPTH_TEST": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2929"
      },
      "SCISSOR_TEST": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3089"
      },
      "POLYGON_OFFSET_FILL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32823"
      },
      "SAMPLE_ALPHA_TO_COVERAGE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32926"
      },
      "SAMPLE_COVERAGE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32928"
      },
      "NO_ERROR": {
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
      "INVALID_ENUM": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1280"
      },
      "INVALID_VALUE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1281"
      },
      "INVALID_OPERATION": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1282"
      },
      "OUT_OF_MEMORY": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1285"
      },
      "CW": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2304"
      },
      "CCW": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2305"
      },
      "LINE_WIDTH": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2849"
      },
      "ALIASED_POINT_SIZE_RANGE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33901"
      },
      "ALIASED_LINE_WIDTH_RANGE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33902"
      },
      "CULL_FACE_MODE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2885"
      },
      "FRONT_FACE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2886"
      },
      "DEPTH_RANGE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2928"
      },
      "DEPTH_WRITEMASK": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2930"
      },
      "DEPTH_CLEAR_VALUE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2931"
      },
      "DEPTH_FUNC": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2932"
      },
      "STENCIL_CLEAR_VALUE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2961"
      },
      "STENCIL_FUNC": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2962"
      },
      "STENCIL_FAIL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2964"
      },
      "STENCIL_PASS_DEPTH_FAIL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2965"
      },
      "STENCIL_PASS_DEPTH_PASS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2966"
      },
      "STENCIL_REF": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2967"
      },
      "STENCIL_VALUE_MASK": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2963"
      },
      "STENCIL_WRITEMASK": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2968"
      },
      "STENCIL_BACK_FUNC": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34816"
      },
      "STENCIL_BACK_FAIL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34817"
      },
      "STENCIL_BACK_PASS_DEPTH_FAIL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34818"
      },
      "STENCIL_BACK_PASS_DEPTH_PASS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34819"
      },
      "STENCIL_BACK_REF": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36003"
      },
      "STENCIL_BACK_VALUE_MASK": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36004"
      },
      "STENCIL_BACK_WRITEMASK": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36005"
      },
      "VIEWPORT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "2978"
      },
      "SCISSOR_BOX": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3088"
      },
      "COLOR_CLEAR_VALUE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3106"
      },
      "COLOR_WRITEMASK": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3107"
      },
      "UNPACK_ALIGNMENT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3317"
      },
      "PACK_ALIGNMENT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3333"
      },
      "MAX_TEXTURE_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3379"
      },
      "MAX_VIEWPORT_DIMS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3386"
      },
      "SUBPIXEL_BITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3408"
      },
      "RED_BITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3410"
      },
      "GREEN_BITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3411"
      },
      "BLUE_BITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3412"
      },
      "ALPHA_BITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3413"
      },
      "DEPTH_BITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3414"
      },
      "STENCIL_BITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "3415"
      },
      "POLYGON_OFFSET_UNITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "10752"
      },
      "POLYGON_OFFSET_FACTOR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32824"
      },
      "TEXTURE_BINDING_2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32873"
      },
      "SAMPLE_BUFFERS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32936"
      },
      "SAMPLES": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32937"
      },
      "SAMPLE_COVERAGE_VALUE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32938"
      },
      "SAMPLE_COVERAGE_INVERT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32939"
      },
      "COMPRESSED_TEXTURE_FORMATS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34467"
      },
      "DONT_CARE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "4352"
      },
      "FASTEST": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "4353"
      },
      "NICEST": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "4354"
      },
      "GENERATE_MIPMAP_HINT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33170"
      },
      "BYTE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5120"
      },
      "UNSIGNED_BYTE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5121"
      },
      "SHORT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5122"
      },
      "UNSIGNED_SHORT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5123"
      },
      "INT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5124"
      },
      "UNSIGNED_INT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5125"
      },
      "FLOAT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5126"
      },
      "DEPTH_COMPONENT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "6402"
      },
      "ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "6406"
      },
      "RGB": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "6407"
      },
      "RGBA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "6408"
      },
      "LUMINANCE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "6409"
      },
      "LUMINANCE_ALPHA": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "6410"
      },
      "UNSIGNED_SHORT_4_4_4_4": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32819"
      },
      "UNSIGNED_SHORT_5_5_5_1": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32820"
      },
      "UNSIGNED_SHORT_5_6_5": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33635"
      },
      "FRAGMENT_SHADER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35632"
      },
      "VERTEX_SHADER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35633"
      },
      "MAX_VERTEX_ATTRIBS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34921"
      },
      "MAX_VERTEX_UNIFORM_VECTORS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36347"
      },
      "MAX_VARYING_VECTORS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36348"
      },
      "MAX_COMBINED_TEXTURE_IMAGE_UNITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35661"
      },
      "MAX_VERTEX_TEXTURE_IMAGE_UNITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35660"
      },
      "MAX_TEXTURE_IMAGE_UNITS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34930"
      },
      "MAX_FRAGMENT_UNIFORM_VECTORS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36349"
      },
      "SHADER_TYPE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35663"
      },
      "DELETE_STATUS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35712"
      },
      "LINK_STATUS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35714"
      },
      "VALIDATE_STATUS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35715"
      },
      "ATTACHED_SHADERS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35717"
      },
      "ACTIVE_UNIFORMS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35718"
      },
      "ACTIVE_ATTRIBUTES": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35721"
      },
      "SHADING_LANGUAGE_VERSION": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35724"
      },
      "CURRENT_PROGRAM": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35725"
      },
      "NEVER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "512"
      },
      "LESS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "513"
      },
      "EQUAL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "514"
      },
      "LEQUAL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "515"
      },
      "GREATER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "516"
      },
      "NOTEQUAL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "517"
      },
      "GEQUAL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "518"
      },
      "ALWAYS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "519"
      },
      "KEEP": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "7680"
      },
      "REPLACE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "7681"
      },
      "INCR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "7682"
      },
      "DECR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "7683"
      },
      "INVERT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5386"
      },
      "INCR_WRAP": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34055"
      },
      "DECR_WRAP": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34056"
      },
      "VENDOR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "7936"
      },
      "RENDERER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "7937"
      },
      "VERSION": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "7938"
      },
      "NEAREST": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "9728"
      },
      "LINEAR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "9729"
      },
      "NEAREST_MIPMAP_NEAREST": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "9984"
      },
      "LINEAR_MIPMAP_NEAREST": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "9985"
      },
      "NEAREST_MIPMAP_LINEAR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "9986"
      },
      "LINEAR_MIPMAP_LINEAR": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "9987"
      },
      "TEXTURE_MAG_FILTER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "10240"
      },
      "TEXTURE_MIN_FILTER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "10241"
      },
      "TEXTURE_WRAP_S": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "10242"
      },
      "TEXTURE_WRAP_T": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "10243"
      },
      "TEXTURE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "5890"
      },
      "TEXTURE_CUBE_MAP": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34067"
      },
      "TEXTURE_BINDING_CUBE_MAP": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34068"
      },
      "TEXTURE_CUBE_MAP_POSITIVE_X": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34069"
      },
      "TEXTURE_CUBE_MAP_NEGATIVE_X": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34070"
      },
      "TEXTURE_CUBE_MAP_POSITIVE_Y": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34071"
      },
      "TEXTURE_CUBE_MAP_NEGATIVE_Y": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34072"
      },
      "TEXTURE_CUBE_MAP_POSITIVE_Z": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34073"
      },
      "TEXTURE_CUBE_MAP_NEGATIVE_Z": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34074"
      },
      "MAX_CUBE_MAP_TEXTURE_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34076"
      },
      "TEXTURE0": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33984"
      },
      "TEXTURE1": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33985"
      },
      "TEXTURE2": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33986"
      },
      "TEXTURE3": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33987"
      },
      "TEXTURE4": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33988"
      },
      "TEXTURE5": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33989"
      },
      "TEXTURE6": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33990"
      },
      "TEXTURE7": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33991"
      },
      "TEXTURE8": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33992"
      },
      "TEXTURE9": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33993"
      },
      "TEXTURE10": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33994"
      },
      "TEXTURE11": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33995"
      },
      "TEXTURE12": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33996"
      },
      "TEXTURE13": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33997"
      },
      "TEXTURE14": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33998"
      },
      "TEXTURE15": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33999"
      },
      "TEXTURE16": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34000"
      },
      "TEXTURE17": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34001"
      },
      "TEXTURE18": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34002"
      },
      "TEXTURE19": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34003"
      },
      "TEXTURE20": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34004"
      },
      "TEXTURE21": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34005"
      },
      "TEXTURE22": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34006"
      },
      "TEXTURE23": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34007"
      },
      "TEXTURE24": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34008"
      },
      "TEXTURE25": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34009"
      },
      "TEXTURE26": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34010"
      },
      "TEXTURE27": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34011"
      },
      "TEXTURE28": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34012"
      },
      "TEXTURE29": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34013"
      },
      "TEXTURE30": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34014"
      },
      "TEXTURE31": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34015"
      },
      "ACTIVE_TEXTURE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34016"
      },
      "REPEAT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "10497"
      },
      "CLAMP_TO_EDGE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33071"
      },
      "MIRRORED_REPEAT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33648"
      },
      "FLOAT_VEC2": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35664"
      },
      "FLOAT_VEC3": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35665"
      },
      "FLOAT_VEC4": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35666"
      },
      "INT_VEC2": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35667"
      },
      "INT_VEC3": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35668"
      },
      "INT_VEC4": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35669"
      },
      "BOOL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35670"
      },
      "BOOL_VEC2": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35671"
      },
      "BOOL_VEC3": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35672"
      },
      "BOOL_VEC4": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35673"
      },
      "FLOAT_MAT2": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35674"
      },
      "FLOAT_MAT3": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35675"
      },
      "FLOAT_MAT4": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35676"
      },
      "SAMPLER_2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35678"
      },
      "SAMPLER_CUBE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35680"
      },
      "VERTEX_ATTRIB_ARRAY_ENABLED": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34338"
      },
      "VERTEX_ATTRIB_ARRAY_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34339"
      },
      "VERTEX_ATTRIB_ARRAY_STRIDE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34340"
      },
      "VERTEX_ATTRIB_ARRAY_TYPE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34341"
      },
      "VERTEX_ATTRIB_ARRAY_NORMALIZED": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34922"
      },
      "VERTEX_ATTRIB_ARRAY_POINTER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34373"
      },
      "VERTEX_ATTRIB_ARRAY_BUFFER_BINDING": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34975"
      },
      "IMPLEMENTATION_COLOR_READ_TYPE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35738"
      },
      "IMPLEMENTATION_COLOR_READ_FORMAT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35739"
      },
      "COMPILE_STATUS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "35713"
      },
      "LOW_FLOAT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36336"
      },
      "MEDIUM_FLOAT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36337"
      },
      "HIGH_FLOAT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36338"
      },
      "LOW_INT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36339"
      },
      "MEDIUM_INT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36340"
      },
      "HIGH_INT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36341"
      },
      "FRAMEBUFFER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36160"
      },
      "RENDERBUFFER": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36161"
      },
      "RGBA4": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32854"
      },
      "RGB5_A1": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32855"
      },
      "RGB565": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36194"
      },
      "DEPTH_COMPONENT16": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33189"
      },
      "STENCIL_INDEX8": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36168"
      },
      "DEPTH_STENCIL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34041"
      },
      "RENDERBUFFER_WIDTH": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36162"
      },
      "RENDERBUFFER_HEIGHT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36163"
      },
      "RENDERBUFFER_INTERNAL_FORMAT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36164"
      },
      "RENDERBUFFER_RED_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36176"
      },
      "RENDERBUFFER_GREEN_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36177"
      },
      "RENDERBUFFER_BLUE_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36178"
      },
      "RENDERBUFFER_ALPHA_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36179"
      },
      "RENDERBUFFER_DEPTH_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36180"
      },
      "RENDERBUFFER_STENCIL_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36181"
      },
      "FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36048"
      },
      "FRAMEBUFFER_ATTACHMENT_OBJECT_NAME": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36049"
      },
      "FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36050"
      },
      "FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36051"
      },
      "COLOR_ATTACHMENT0": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36064"
      },
      "DEPTH_ATTACHMENT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36096"
      },
      "STENCIL_ATTACHMENT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36128"
      },
      "DEPTH_STENCIL_ATTACHMENT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "33306"
      },
      "NONE": {
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
      "FRAMEBUFFER_COMPLETE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36053"
      },
      "FRAMEBUFFER_INCOMPLETE_ATTACHMENT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36054"
      },
      "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36055"
      },
      "FRAMEBUFFER_INCOMPLETE_DIMENSIONS": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36057"
      },
      "FRAMEBUFFER_UNSUPPORTED": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36061"
      },
      "FRAMEBUFFER_BINDING": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36006"
      },
      "RENDERBUFFER_BINDING": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "36007"
      },
      "MAX_RENDERBUFFER_SIZE": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "34024"
      },
      "INVALID_FRAMEBUFFER_OPERATION": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "1286"
      },
      "UNPACK_FLIP_Y_WEBGL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "37440"
      },
      "UNPACK_PREMULTIPLY_ALPHA_WEBGL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "37441"
      },
      "CONTEXT_LOST_WEBGL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "37442"
      },
      "UNPACK_COLORSPACE_CONVERSION_WEBGL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "37443"
      },
      "BROWSER_DEFAULT_WEBGL": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "37444"
      },
      "RGB8": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32849"
      },
      "RGBA8": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": false,
          "writable": false
        },
        "kind": "data",
        "valueType": "number",
        "value": "32856"
      },
      "canvas": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "WebGLRenderingContext",
            "propName": "canvas",
            "callType": "get"
          }
        }
      },
      "drawingBufferWidth": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "WebGLRenderingContext",
            "propName": "drawingBufferWidth",
            "callType": "get"
          }
        }
      },
      "drawingBufferHeight": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "WebGLRenderingContext",
            "propName": "drawingBufferHeight",
            "callType": "get"
          }
        }
      },
      "drawingBufferColorSpace": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "WebGLRenderingContext",
            "propName": "drawingBufferColorSpace",
            "callType": "get"
          },
          "setter": {
            "objName": "WebGLRenderingContext",
            "propName": "drawingBufferColorSpace",
            "callType": "set"
          }
        }
      },
      "unpackColorSpace": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "WebGLRenderingContext",
            "propName": "unpackColorSpace",
            "callType": "get"
          },
          "setter": {
            "objName": "WebGLRenderingContext",
            "propName": "unpackColorSpace",
            "callType": "set"
          }
        }
      },
      "activeTexture": {
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
          "objName": "WebGLRenderingContext",
          "propName": "activeTexture",
          "callType": "apply"
        }
      },
      "attachShader": {
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
          "objName": "WebGLRenderingContext",
          "propName": "attachShader",
          "callType": "apply"
        }
      },
      "bindAttribLocation": {
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
          "objName": "WebGLRenderingContext",
          "propName": "bindAttribLocation",
          "callType": "apply"
        }
      },
      "bindRenderbuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "bindRenderbuffer",
          "callType": "apply"
        }
      },
      "blendColor": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "blendColor",
          "callType": "apply"
        }
      },
      "blendEquation": {
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
          "objName": "WebGLRenderingContext",
          "propName": "blendEquation",
          "callType": "apply"
        }
      },
      "blendEquationSeparate": {
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
          "objName": "WebGLRenderingContext",
          "propName": "blendEquationSeparate",
          "callType": "apply"
        }
      },
      "blendFunc": {
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
          "objName": "WebGLRenderingContext",
          "propName": "blendFunc",
          "callType": "apply"
        }
      },
      "blendFuncSeparate": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "blendFuncSeparate",
          "callType": "apply"
        }
      },
      "bufferData": {
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
          "objName": "WebGLRenderingContext",
          "propName": "bufferData",
          "callType": "apply"
        }
      },
      "bufferSubData": {
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
          "objName": "WebGLRenderingContext",
          "propName": "bufferSubData",
          "callType": "apply"
        }
      },
      "checkFramebufferStatus": {
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
          "objName": "WebGLRenderingContext",
          "propName": "checkFramebufferStatus",
          "callType": "apply"
        }
      },
      "compileShader": {
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
          "objName": "WebGLRenderingContext",
          "propName": "compileShader",
          "callType": "apply"
        }
      },
      "compressedTexImage2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 7,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "compressedTexImage2D",
          "callType": "apply"
        }
      },
      "compressedTexSubImage2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 8,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "compressedTexSubImage2D",
          "callType": "apply"
        }
      },
      "copyTexImage2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 8,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "copyTexImage2D",
          "callType": "apply"
        }
      },
      "copyTexSubImage2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 8,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "copyTexSubImage2D",
          "callType": "apply"
        }
      },
      "createBuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "createBuffer",
          "callType": "apply"
        }
      },
      "createFramebuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "createFramebuffer",
          "callType": "apply"
        }
      },
      "createProgram": {
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
          "objName": "WebGLRenderingContext",
          "propName": "createProgram",
          "callType": "apply"
        }
      },
      "createRenderbuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "createRenderbuffer",
          "callType": "apply"
        }
      },
      "createShader": {
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
          "objName": "WebGLRenderingContext",
          "propName": "createShader",
          "callType": "apply"
        }
      },
      "createTexture": {
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
          "objName": "WebGLRenderingContext",
          "propName": "createTexture",
          "callType": "apply"
        }
      },
      "cullFace": {
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
          "objName": "WebGLRenderingContext",
          "propName": "cullFace",
          "callType": "apply"
        }
      },
      "deleteBuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "deleteBuffer",
          "callType": "apply"
        }
      },
      "deleteFramebuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "deleteFramebuffer",
          "callType": "apply"
        }
      },
      "deleteProgram": {
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
          "objName": "WebGLRenderingContext",
          "propName": "deleteProgram",
          "callType": "apply"
        }
      },
      "deleteRenderbuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "deleteRenderbuffer",
          "callType": "apply"
        }
      },
      "deleteShader": {
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
          "objName": "WebGLRenderingContext",
          "propName": "deleteShader",
          "callType": "apply"
        }
      },
      "deleteTexture": {
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
          "objName": "WebGLRenderingContext",
          "propName": "deleteTexture",
          "callType": "apply"
        }
      },
      "depthFunc": {
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
          "objName": "WebGLRenderingContext",
          "propName": "depthFunc",
          "callType": "apply"
        }
      },
      "depthMask": {
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
          "objName": "WebGLRenderingContext",
          "propName": "depthMask",
          "callType": "apply"
        }
      },
      "depthRange": {
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
          "objName": "WebGLRenderingContext",
          "propName": "depthRange",
          "callType": "apply"
        }
      },
      "detachShader": {
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
          "objName": "WebGLRenderingContext",
          "propName": "detachShader",
          "callType": "apply"
        }
      },
      "disable": {
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
          "objName": "WebGLRenderingContext",
          "propName": "disable",
          "callType": "apply"
        }
      },
      "enable": {
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
          "objName": "WebGLRenderingContext",
          "propName": "enable",
          "callType": "apply"
        }
      },
      "finish": {
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
          "objName": "WebGLRenderingContext",
          "propName": "finish",
          "callType": "apply"
        }
      },
      "flush": {
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
          "objName": "WebGLRenderingContext",
          "propName": "flush",
          "callType": "apply"
        }
      },
      "framebufferRenderbuffer": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "framebufferRenderbuffer",
          "callType": "apply"
        }
      },
      "framebufferTexture2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 5,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "framebufferTexture2D",
          "callType": "apply"
        }
      },
      "frontFace": {
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
          "objName": "WebGLRenderingContext",
          "propName": "frontFace",
          "callType": "apply"
        }
      },
      "generateMipmap": {
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
          "objName": "WebGLRenderingContext",
          "propName": "generateMipmap",
          "callType": "apply"
        }
      },
      "getActiveAttrib": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getActiveAttrib",
          "callType": "apply"
        }
      },
      "getActiveUniform": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getActiveUniform",
          "callType": "apply"
        }
      },
      "getAttachedShaders": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getAttachedShaders",
          "callType": "apply"
        }
      },
      "getAttribLocation": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getAttribLocation",
          "callType": "apply"
        }
      },
      "getBufferParameter": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getBufferParameter",
          "callType": "apply"
        }
      },
      "getContextAttributes": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getContextAttributes",
          "callType": "apply"
        }
      },
      "getError": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getError",
          "callType": "apply"
        }
      },
      "getExtension": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getExtension",
          "callType": "apply"
        }
      },
      "getFramebufferAttachmentParameter": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getFramebufferAttachmentParameter",
          "callType": "apply"
        }
      },
      "getParameter": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getParameter",
          "callType": "apply"
        }
      },
      "getProgramInfoLog": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getProgramInfoLog",
          "callType": "apply"
        }
      },
      "getProgramParameter": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getProgramParameter",
          "callType": "apply"
        }
      },
      "getRenderbufferParameter": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getRenderbufferParameter",
          "callType": "apply"
        }
      },
      "getShaderInfoLog": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getShaderInfoLog",
          "callType": "apply"
        }
      },
      "getShaderParameter": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getShaderParameter",
          "callType": "apply"
        }
      },
      "getShaderPrecisionFormat": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getShaderPrecisionFormat",
          "callType": "apply"
        }
      },
      "getShaderSource": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getShaderSource",
          "callType": "apply"
        }
      },
      "getSupportedExtensions": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getSupportedExtensions",
          "callType": "apply"
        }
      },
      "getTexParameter": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getTexParameter",
          "callType": "apply"
        }
      },
      "getUniform": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getUniform",
          "callType": "apply"
        }
      },
      "getUniformLocation": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getUniformLocation",
          "callType": "apply"
        }
      },
      "getVertexAttrib": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getVertexAttrib",
          "callType": "apply"
        }
      },
      "getVertexAttribOffset": {
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
          "objName": "WebGLRenderingContext",
          "propName": "getVertexAttribOffset",
          "callType": "apply"
        }
      },
      "hint": {
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
          "objName": "WebGLRenderingContext",
          "propName": "hint",
          "callType": "apply"
        }
      },
      "isBuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "isBuffer",
          "callType": "apply"
        }
      },
      "isContextLost": {
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
          "objName": "WebGLRenderingContext",
          "propName": "isContextLost",
          "callType": "apply"
        }
      },
      "isEnabled": {
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
          "objName": "WebGLRenderingContext",
          "propName": "isEnabled",
          "callType": "apply"
        }
      },
      "isFramebuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "isFramebuffer",
          "callType": "apply"
        }
      },
      "isProgram": {
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
          "objName": "WebGLRenderingContext",
          "propName": "isProgram",
          "callType": "apply"
        }
      },
      "isRenderbuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "isRenderbuffer",
          "callType": "apply"
        }
      },
      "isShader": {
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
          "objName": "WebGLRenderingContext",
          "propName": "isShader",
          "callType": "apply"
        }
      },
      "isTexture": {
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
          "objName": "WebGLRenderingContext",
          "propName": "isTexture",
          "callType": "apply"
        }
      },
      "lineWidth": {
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
          "objName": "WebGLRenderingContext",
          "propName": "lineWidth",
          "callType": "apply"
        }
      },
      "linkProgram": {
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
          "objName": "WebGLRenderingContext",
          "propName": "linkProgram",
          "callType": "apply"
        }
      },
      "pixelStorei": {
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
          "objName": "WebGLRenderingContext",
          "propName": "pixelStorei",
          "callType": "apply"
        }
      },
      "polygonOffset": {
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
          "objName": "WebGLRenderingContext",
          "propName": "polygonOffset",
          "callType": "apply"
        }
      },
      "readPixels": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 7,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "readPixels",
          "callType": "apply"
        }
      },
      "renderbufferStorage": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "renderbufferStorage",
          "callType": "apply"
        }
      },
      "sampleCoverage": {
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
          "objName": "WebGLRenderingContext",
          "propName": "sampleCoverage",
          "callType": "apply"
        }
      },
      "shaderSource": {
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
          "objName": "WebGLRenderingContext",
          "propName": "shaderSource",
          "callType": "apply"
        }
      },
      "stencilFunc": {
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
          "objName": "WebGLRenderingContext",
          "propName": "stencilFunc",
          "callType": "apply"
        }
      },
      "stencilFuncSeparate": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "stencilFuncSeparate",
          "callType": "apply"
        }
      },
      "stencilMask": {
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
          "objName": "WebGLRenderingContext",
          "propName": "stencilMask",
          "callType": "apply"
        }
      },
      "stencilMaskSeparate": {
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
          "objName": "WebGLRenderingContext",
          "propName": "stencilMaskSeparate",
          "callType": "apply"
        }
      },
      "stencilOp": {
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
          "objName": "WebGLRenderingContext",
          "propName": "stencilOp",
          "callType": "apply"
        }
      },
      "stencilOpSeparate": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "stencilOpSeparate",
          "callType": "apply"
        }
      },
      "texImage2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 6,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "texImage2D",
          "callType": "apply"
        }
      },
      "texParameterf": {
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
          "objName": "WebGLRenderingContext",
          "propName": "texParameterf",
          "callType": "apply"
        }
      },
      "texParameteri": {
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
          "objName": "WebGLRenderingContext",
          "propName": "texParameteri",
          "callType": "apply"
        }
      },
      "texSubImage2D": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 7,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "texSubImage2D",
          "callType": "apply"
        }
      },
      "useProgram": {
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
          "objName": "WebGLRenderingContext",
          "propName": "useProgram",
          "callType": "apply"
        }
      },
      "validateProgram": {
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
          "objName": "WebGLRenderingContext",
          "propName": "validateProgram",
          "callType": "apply"
        }
      },
      "bindBuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "bindBuffer",
          "callType": "apply"
        }
      },
      "bindFramebuffer": {
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
          "objName": "WebGLRenderingContext",
          "propName": "bindFramebuffer",
          "callType": "apply"
        }
      },
      "bindTexture": {
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
          "objName": "WebGLRenderingContext",
          "propName": "bindTexture",
          "callType": "apply"
        }
      },
      "clear": {
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
          "objName": "WebGLRenderingContext",
          "propName": "clear",
          "callType": "apply"
        }
      },
      "clearColor": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "clearColor",
          "callType": "apply"
        }
      },
      "clearDepth": {
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
          "objName": "WebGLRenderingContext",
          "propName": "clearDepth",
          "callType": "apply"
        }
      },
      "clearStencil": {
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
          "objName": "WebGLRenderingContext",
          "propName": "clearStencil",
          "callType": "apply"
        }
      },
      "colorMask": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "colorMask",
          "callType": "apply"
        }
      },
      "disableVertexAttribArray": {
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
          "objName": "WebGLRenderingContext",
          "propName": "disableVertexAttribArray",
          "callType": "apply"
        }
      },
      "drawArrays": {
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
          "objName": "WebGLRenderingContext",
          "propName": "drawArrays",
          "callType": "apply"
        }
      },
      "drawElements": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "drawElements",
          "callType": "apply"
        }
      },
      "enableVertexAttribArray": {
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
          "objName": "WebGLRenderingContext",
          "propName": "enableVertexAttribArray",
          "callType": "apply"
        }
      },
      "scissor": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "scissor",
          "callType": "apply"
        }
      },
      "uniform1f": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform1f",
          "callType": "apply"
        }
      },
      "uniform1fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform1fv",
          "callType": "apply"
        }
      },
      "uniform1i": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform1i",
          "callType": "apply"
        }
      },
      "uniform1iv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform1iv",
          "callType": "apply"
        }
      },
      "uniform2f": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform2f",
          "callType": "apply"
        }
      },
      "uniform2fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform2fv",
          "callType": "apply"
        }
      },
      "uniform2i": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform2i",
          "callType": "apply"
        }
      },
      "uniform2iv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform2iv",
          "callType": "apply"
        }
      },
      "uniform3f": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "uniform3f",
          "callType": "apply"
        }
      },
      "uniform3fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform3fv",
          "callType": "apply"
        }
      },
      "uniform3i": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "uniform3i",
          "callType": "apply"
        }
      },
      "uniform3iv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform3iv",
          "callType": "apply"
        }
      },
      "uniform4f": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 5,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "uniform4f",
          "callType": "apply"
        }
      },
      "uniform4fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform4fv",
          "callType": "apply"
        }
      },
      "uniform4i": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 5,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "uniform4i",
          "callType": "apply"
        }
      },
      "uniform4iv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniform4iv",
          "callType": "apply"
        }
      },
      "uniformMatrix2fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniformMatrix2fv",
          "callType": "apply"
        }
      },
      "uniformMatrix3fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniformMatrix3fv",
          "callType": "apply"
        }
      },
      "uniformMatrix4fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "uniformMatrix4fv",
          "callType": "apply"
        }
      },
      "vertexAttrib1f": {
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
          "objName": "WebGLRenderingContext",
          "propName": "vertexAttrib1f",
          "callType": "apply"
        }
      },
      "vertexAttrib1fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "vertexAttrib1fv",
          "callType": "apply"
        }
      },
      "vertexAttrib2f": {
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
          "objName": "WebGLRenderingContext",
          "propName": "vertexAttrib2f",
          "callType": "apply"
        }
      },
      "vertexAttrib2fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "vertexAttrib2fv",
          "callType": "apply"
        }
      },
      "vertexAttrib3f": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "vertexAttrib3f",
          "callType": "apply"
        }
      },
      "vertexAttrib3fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "vertexAttrib3fv",
          "callType": "apply"
        }
      },
      "vertexAttrib4f": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 5,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "vertexAttrib4f",
          "callType": "apply"
        }
      },
      "vertexAttrib4fv": {
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
          "objName": "WebGLRenderingContext",
          "propName": "vertexAttrib4fv",
          "callType": "apply"
        }
      },
      "vertexAttribPointer": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 6,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "vertexAttribPointer",
          "callType": "apply"
        }
      },
      "viewport": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true,
          "writable": true
        },
        "kind": "method",
        "length": 4,
        "brandCheck": true,
        "dispatch": {
          "objName": "WebGLRenderingContext",
          "propName": "viewport",
          "callType": "apply"
        }
      },
      "drawingBufferFormat": {
        "owner": "prototype",
        "attributes": {
          "enumerable": true,
          "configurable": true
        },
        "kind": "accessor",
        "brandCheck": true,
        "dispatch": {
          "getter": {
            "objName": "WebGLRenderingContext",
            "propName": "drawingBufferFormat",
            "callType": "get"
          }
        }
      },
      "drawingBufferStorage": {
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
          "objName": "WebGLRenderingContext",
          "propName": "drawingBufferStorage",
          "callType": "apply"
        }
      },
      "makeXRCompatible": {
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
          "objName": "WebGLRenderingContext",
          "propName": "makeXRCompatible",
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
        "value": "WebGLRenderingContext"
      }
    }
  };  leapenv.skeletonObjects.push(WebGLRenderingContext_type_skeleton);})(globalThis);
