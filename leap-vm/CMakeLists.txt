cmake_minimum_required(VERSION 3.15)
project(leapvm)

# 0. 生成 compile_commands.json 供 VS Code IntelliSense 使用
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# 1. 强制使用 C++20 (V8 13.x 必须)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(LEAPVM_ENABLE_LEXBOR "Enable Lexbor HTML parser backend" ON)

# 2. 【核心】宏定义
# V8_STATIC_LIBRARY: 关键！禁止生成 __declspec(dllimport)
# NAPI_DISABLE_CPP_EXCEPTIONS: Node Addon 标准配置
# V8_ENABLE_I18N_SUPPORT: 启用 Intl，与 v8_monolith.lib 编译时的 v8_enable_i18n_support=true 保持一致
add_definitions(
    -DV8_COMPRESS_POINTERS
    -DV8_ENABLE_SANDBOX
    -DV8_STATIC_LIBRARY
    -DV8_ENABLE_I18N_SUPPORT
    -DNAPI_DISABLE_CPP_EXCEPTIONS
    -DUNICODE
)

# 3. 查找 Node.js 头文件路径
execute_process(
    COMMAND node -e "console.log(require('os').homedir())"
    OUTPUT_VARIABLE USER_HOME
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
execute_process(
    COMMAND node -e "console.log(process.version.slice(1))"
    OUTPUT_VARIABLE NODE_VERSION
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

# node-gyp 缓存的头文件和库文件路径
if(WIN32)
    set(NODE_GYP_DIR "${USER_HOME}/AppData/Local/node-gyp/Cache/${NODE_VERSION}")
    set(NODE_LIB "${NODE_GYP_DIR}/x64/node.lib")
else()
    set(NODE_GYP_DIR "${USER_HOME}/.cache/node-gyp/${NODE_VERSION}")
    set(NODE_LIB "")
endif()
set(NODE_GYP_HEADERS "${NODE_GYP_DIR}/include/node")
message(STATUS "Node.js headers: ${NODE_GYP_HEADERS}")
if(WIN32)
    message(STATUS "Node.js library: ${NODE_LIB}")
endif()

# 4. 头文件路径
#  关键：BEFORE 强制让你的 V8 头文件排在最前面
# 这样编译时 #include "v8.h" 会先找到你的 V8，而不是 Node 的
include_directories(BEFORE
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/include"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/leapvm"
)

# Node-API 头文件（放在后面，避免污染 V8 头文件）
include_directories(
    "${CMAKE_CURRENT_SOURCE_DIR}/node_modules/node-addon-api"
)
if(CMAKE_JS_INC)
    include_directories(${CMAKE_JS_INC})
else()
    include_directories("${NODE_GYP_HEADERS}")
endif()

# 5. 源文件
file(GLOB SOURCE_FILES
    "src/addon/main.cc"
    "src/addon/vm_instance_wrapper.cc"
    "src/leapvm/log.cc"
    "src/leapvm/hook_filter.cc"
    "src/leapvm/v8_platform.cc"
    "src/leapvm/vm_instance.cc"
    "src/leapvm/monitor.cc"
    "src/leapvm/native_wrapper.cc"
    "src/leapvm/dom_core.cc"
    "src/leapvm/builtin_wrapper.cc"
    "src/leapvm/skeleton/dispatch_bridge.cc"
    "src/leapvm/skeleton/hook_log_policy.cc"
    "src/leapvm/skeleton/skeleton_builder.cc"
    "src/leapvm/skeleton/skeleton_parser.cc"
    "src/leapvm/skeleton/skeleton_registry.cc"
    "src/leapvm/leap_inspector_client.cc"
    "src/leapvm/ws_inspector_server.cc"
)

# 6. 生成 Node 插件 (.node)
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES})

# 去掉 lib 前缀，后缀改为 .node
set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)

# 7. 【核心】链接顺序
#  关键：链接顺序决定符号解析优先级！
# 1. v8_monolith.lib 必须放在最前面（V8 符号优先使用我们的）
# 2. node_napi_only.lib 放在后面（只含 napi_*/node_api_* 符号，无 V8 符号）
#    由 scripts/generate_napi_lib.ps1 从 node.lib 提取生成
#    Node.js 升级后需重新运行该脚本
# 注意：v8_monolith.lib 使用 v8_enable_i18n_support=true 编译，ICU 符号已通过
#       U_ICU_VERSION_SUFFIX(_leapvm) rename，不与 Node.js 自带 ICU 冲突
if(WIN32)
    set(V8_LIB_PATH "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib/v8_monolith.lib")

    target_link_libraries(${PROJECT_NAME} PRIVATE
        "${V8_LIB_PATH}"
        "${CMAKE_CURRENT_SOURCE_DIR}/third_party/node/node_napi_only.lib"
    )
else()
    set(V8_LIB_PATH "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libv8_monolith.a")
    if(NOT EXISTS "${V8_LIB_PATH}")
        message(FATAL_ERROR "Missing Linux V8 static library: ${V8_LIB_PATH}")
    endif()
    # 注意：该静态库必须用 v8_monolithic_for_shared_library=true 重新编译，
    # 否则链接到 .node(共享库) 时会出现 TLS relocation 错误。
    set(V8_LIBCXX_PATH "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libc++.a")
    set(V8_LIBCXXABI_PATH "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libc++abi.a")
    set(V8_LIBCXX_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libcxx/include")
    set(V8_LIBCXXABI_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libcxxabi/include")
    set(V8_STDLIB_LIBS "")
    if(EXISTS "${V8_LIBCXX_PATH}" AND EXISTS "${V8_LIBCXXABI_PATH}")
        list(APPEND V8_STDLIB_LIBS "${V8_LIBCXX_PATH}" "${V8_LIBCXXABI_PATH}")
        if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
            if(EXISTS "${V8_LIBCXX_INCLUDE_DIR}" AND EXISTS "${V8_LIBCXXABI_INCLUDE_DIR}")
                # V8(use_custom_libcxx=true) 使用 libc++ ABI(std::__Cr)，addon 需同 ABI。
                target_include_directories(${PROJECT_NAME} SYSTEM PRIVATE
                    "${V8_LIBCXX_INCLUDE_DIR}"
                    "${V8_LIBCXXABI_INCLUDE_DIR}"
                )
                target_compile_definitions(${PROJECT_NAME} PRIVATE
                    _LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_NONE
                )
                target_compile_options(${PROJECT_NAME} PRIVATE -stdlib=libc++)
            else()
                message(FATAL_ERROR "Missing libc++ headers for Linux V8 build: ${V8_LIBCXX_INCLUDE_DIR}")
            endif()
        endif()
    endif()

    # ThinLTO: 跨编译单元内联优化，对齐 Windows MSVC LTCG
    # 需要 Clang + LLD（系统 ld 不支持 ThinLTO bitcode）
    option(LEAPVM_ENABLE_LTO "Enable ThinLTO for Linux builds" ON)
    if(LEAPVM_ENABLE_LTO AND CMAKE_CXX_COMPILER_ID MATCHES "Clang")
        target_compile_options(${PROJECT_NAME} PRIVATE -flto=thin)
        target_link_options(${PROJECT_NAME} PRIVATE -flto=thin -fuse-ld=lld)
        message(STATUS "ThinLTO enabled for leapvm (using LLD)")
    endif()

    target_link_libraries(${PROJECT_NAME} PRIVATE
        "${V8_LIB_PATH}"
        ${V8_STDLIB_LIBS}
        pthread
        dl
    )
    target_link_options(${PROJECT_NAME} PRIVATE
        "-Wl,-Bsymbolic"
        "-Wl,--exclude-libs,ALL"
    )
endif()

if(LEAPVM_ENABLE_LEXBOR)
    include(FetchContent)

    set(LEXBOR_BUILD_SHARED OFF CACHE BOOL "" FORCE)
    set(LEXBOR_BUILD_STATIC ON CACHE BOOL "" FORCE)
    set(LEXBOR_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(LEXBOR_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(LEXBOR_BUILD_TESTS_CPP OFF CACHE BOOL "" FORCE)
    set(LEXBOR_BUILD_UTILS OFF CACHE BOOL "" FORCE)
    set(LEXBOR_BUILD_BENCHMARKS OFF CACHE BOOL "" FORCE)
    set(LEXBOR_INSTALL_HEADERS OFF CACHE BOOL "" FORCE)

    FetchContent_Declare(
        lexbor
        GIT_REPOSITORY https://github.com/lexbor/lexbor.git
        GIT_TAG v2.6.0
        GIT_SHALLOW TRUE
    )
    FetchContent_MakeAvailable(lexbor)

    if(TARGET lexbor_static)
        if(MSVC)
            target_compile_options(lexbor_static PRIVATE /MT)
        endif()

        target_link_libraries(${PROJECT_NAME} PRIVATE lexbor_static)
        target_compile_definitions(${PROJECT_NAME} PRIVATE LEAPVM_HAS_LEXBOR=1)
    else()
        message(FATAL_ERROR "LEAPVM_ENABLE_LEXBOR=ON but target lexbor_static was not created")
    endif()
else()
    target_compile_definitions(${PROJECT_NAME} PRIVATE LEAPVM_HAS_LEXBOR=0)
endif()

if(WIN32)
    target_link_libraries(${PROJECT_NAME} PRIVATE winmm dbghelp)
else()
    # TODO: non-Windows platform support for inspector/socket deps
endif()

# 8. 【关键】MSVC 链接器设置
if(MSVC)
    # /MT: 静态链接 CRT（与 V8 保持一致）
    # /Zc:__cplusplus: 正确设置 __cplusplus 宏
    target_compile_options(${PROJECT_NAME} PRIVATE
        /MT
        /Zc:__cplusplus
        /bigobj
    )

    # 【核心】链接器标志
    # /WHOLEARCHIVE: 强制链接 v8_monolith.lib 的所有符号（V8 需要完整符号表）
    # /DELAYLOAD: 延迟加载 NODE.EXE，避免运行时符号冲突
    # 注意：node_napi_only.lib 只含 napi_* 符号，与 v8_monolith.lib 无重叠，
    #       因此不再需要 /FORCE:MULTIPLE
    set_target_properties(${PROJECT_NAME} PROPERTIES
        LINK_FLAGS "/WHOLEARCHIVE:${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib/v8_monolith.lib /DELAYLOAD:NODE.EXE delayimp.lib"
    )
endif()

# ============================================================================
# uSockets 编译配置 (用于 WebSocket Inspector Server)
# ============================================================================

set(USOCKETS_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/uSockets/src")
if(NOT EXISTS "${USOCKETS_SRC_DIR}")
    message(FATAL_ERROR "uSockets source directory not found: ${USOCKETS_SRC_DIR}")
endif()

# uSockets 源文件
file(GLOB USOCKETS_SOURCES
    "${USOCKETS_SRC_DIR}/*.c"
    "${USOCKETS_SRC_DIR}/eventing/*.c"
)

# 编译 uSockets 为静态库
add_library(usockets STATIC ${USOCKETS_SOURCES})
set_target_properties(usockets PROPERTIES POSITION_INDEPENDENT_CODE ON)

# uSockets 编译选项 (禁用 SSL 简化依赖)
target_compile_definitions(usockets PRIVATE
    LIBUS_NO_SSL=1
)

# Windows 平台使用静态 CRT，与主项目保持一致
if(MSVC)
    target_compile_options(usockets PRIVATE /MT)
endif()

target_include_directories(usockets PUBLIC
    "${USOCKETS_SRC_DIR}"
)

# Windows 平台需要链接 ws2_32
if(WIN32)
    target_link_libraries(usockets PRIVATE ws2_32)
endif()

# uWebSockets 头文件 (header-only 库)
include_directories("${CMAKE_CURRENT_SOURCE_DIR}/third_party/uWebSockets/src")

# 链接 uSockets 到主项目
target_link_libraries(${PROJECT_NAME} PRIVATE usockets)
