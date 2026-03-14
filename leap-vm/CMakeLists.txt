cmake_minimum_required(VERSION 3.15)

if(NOT WIN32)
    set(LEAPVM_V8_TOOLCHAIN_BIN
        "/home/hostxxii/v8-build/v8/third_party/llvm-build/Release+Asserts/bin")
    set(LEAPVM_V8_CLANG "${LEAPVM_V8_TOOLCHAIN_BIN}/clang")
    set(LEAPVM_V8_CLANGXX "${LEAPVM_V8_TOOLCHAIN_BIN}/clang++")
    set(LEAPVM_V8_LLVM_AR "${LEAPVM_V8_TOOLCHAIN_BIN}/llvm-ar")

    if((NOT DEFINED CMAKE_C_COMPILER OR CMAKE_C_COMPILER STREQUAL "") AND
       "$ENV{CC}" STREQUAL "" AND EXISTS "${LEAPVM_V8_CLANG}")
        set(CMAKE_C_COMPILER "${LEAPVM_V8_CLANG}" CACHE FILEPATH
            "C compiler pinned to V8 toolchain clang" FORCE)
    endif()

    if((NOT DEFINED CMAKE_CXX_COMPILER OR CMAKE_CXX_COMPILER STREQUAL "") AND
       "$ENV{CXX}" STREQUAL "" AND EXISTS "${LEAPVM_V8_CLANGXX}")
        set(CMAKE_CXX_COMPILER "${LEAPVM_V8_CLANGXX}" CACHE FILEPATH
            "CXX compiler pinned to V8 toolchain clang++" FORCE)
    endif()

    if((NOT DEFINED CMAKE_AR OR CMAKE_AR STREQUAL "") AND
       EXISTS "${LEAPVM_V8_LLVM_AR}")
        set(CMAKE_AR "${LEAPVM_V8_LLVM_AR}" CACHE FILEPATH
            "Archiver pinned to V8 toolchain llvm-ar" FORCE)
    endif()
endif()

project(leapvm)

# 0. 生成 compile_commands.json 供 VS Code IntelliSense 使用
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# 1. 强制使用 C++20 (V8 13.x 必须)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(LEAPVM_ENABLE_LEXBOR "Enable Lexbor HTML parser backend" ON)
set(LEAPVM_LEXBOR_SOURCE_DIR "" CACHE PATH "Optional local Lexbor source directory")

if(NOT WIN32)
    message(STATUS "Linux C compiler: ${CMAKE_C_COMPILER}")
    message(STATUS "Linux CXX compiler: ${CMAKE_CXX_COMPILER}")
    message(STATUS "Linux archiver: ${CMAKE_AR}")
endif()

# 2. 【核心】宏定义
# V8_STATIC_LIBRARY: 关键！禁止生成 __declspec(dllimport)
# V8_ENABLE_I18N_SUPPORT: 启用 Intl，与 v8_monolith.lib 编译时的 v8_enable_i18n_support=true 保持一致
add_definitions(
    -DV8_COMPRESS_POINTERS
    -DV8_ENABLE_SANDBOX
    -DV8_STATIC_LIBRARY
    -DV8_ENABLE_I18N_SUPPORT
    -DUNICODE
)

# 3. 头文件路径
#  关键：BEFORE 强制让你的 V8 头文件排在最前面
include_directories(BEFORE
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/include"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/leapvm"
)

# 4. 源文件
set(LEAPVM_CORE_SOURCES
    "src/leapvm/log.cc"
    "src/leapvm/hook_filter.cc"
    "src/leapvm/leap_background_scheduler.cc"
    "src/leapvm/leap_delayed_task_scheduler.cc"
    "src/leapvm/leap_foreground_task_runner.cc"
    "src/leapvm/leap_platform.cc"
    "src/leapvm/leap_platform_metrics.cc"
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

# 5. V8 库路径 + libc++
if(WIN32)
    set(V8_LIB_PATH "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib/v8_monolith.lib")
else()
    set(V8_LIB_PATH "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libv8_monolith.a")
    if(NOT EXISTS "${V8_LIB_PATH}")
        message(FATAL_ERROR "Missing Linux V8 static library: ${V8_LIB_PATH}")
    endif()
    if(NOT CMAKE_CXX_COMPILER_ID MATCHES "Clang")
        message(FATAL_ERROR
            "Linux leapvm build must use the V8 Clang toolchain. "
            "Current compiler: ${CMAKE_CXX_COMPILER} (${CMAKE_CXX_COMPILER_ID})")
    endif()
    set(V8_LIBCXX_PATH "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libc++.a")
    set(V8_LIBCXXABI_PATH "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libc++abi.a")
    set(V8_LIBCXX_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libcxx/include")
    set(V8_LIBCXXABI_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib-linux/libcxxabi/include")
    set(V8_STDLIB_LIBS "")
    if(EXISTS "${V8_LIBCXX_PATH}" AND EXISTS "${V8_LIBCXXABI_PATH}")
        list(APPEND V8_STDLIB_LIBS "${V8_LIBCXX_PATH}" "${V8_LIBCXXABI_PATH}")
    endif()
    option(LEAPVM_ENABLE_LTO "Enable ThinLTO for Linux builds" ON)
endif()

# ============================================================================
# Lexbor HTML parser (server 使用)
# ============================================================================
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

    set(LEAPVM_EFFECTIVE_LEXBOR_SOURCE_DIR "${LEAPVM_LEXBOR_SOURCE_DIR}")
    if(LEAPVM_EFFECTIVE_LEXBOR_SOURCE_DIR STREQUAL "")
        foreach(candidate
            "${CMAKE_CURRENT_SOURCE_DIR}/third_party/lexbor-src"
            "${CMAKE_CURRENT_SOURCE_DIR}/build/_deps/lexbor-src"
            "${CMAKE_CURRENT_SOURCE_DIR}/build-check/_deps/lexbor-src")
            if(EXISTS "${candidate}/CMakeLists.txt")
                set(LEAPVM_EFFECTIVE_LEXBOR_SOURCE_DIR "${candidate}")
                break()
            endif()
        endforeach()
    endif()

    if(EXISTS "${LEAPVM_EFFECTIVE_LEXBOR_SOURCE_DIR}/CMakeLists.txt")
        message(STATUS "Using local Lexbor source: ${LEAPVM_EFFECTIVE_LEXBOR_SOURCE_DIR}")
        add_subdirectory(
            "${LEAPVM_EFFECTIVE_LEXBOR_SOURCE_DIR}"
            "${CMAKE_BINARY_DIR}/_deps/lexbor-build")
    else()
        FetchContent_Declare(
            lexbor
            GIT_REPOSITORY https://github.com/lexbor/lexbor.git
            GIT_TAG v2.6.0
            GIT_SHALLOW TRUE
        )
        FetchContent_MakeAvailable(lexbor)
    endif()

    if(TARGET lexbor_static)
        if(MSVC)
            target_compile_options(lexbor_static PRIVATE /MT)
        endif()
    else()
        message(FATAL_ERROR "LEAPVM_ENABLE_LEXBOR=ON but target lexbor_static was not created")
    endif()
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

# ============================================================================
# Standalone LeapVM Server (独立 C++ 可执行服务)
# ============================================================================
option(LEAPVM_BUILD_SERVER "Build standalone leapvm-server executable" ON)

if(LEAPVM_BUILD_SERVER)
    message(STATUS "=== Building leapvm_server (standalone) ===")

    set(LEAPVM_SERVER_SOURCES
        "src/service/main.cc"
        "src/service/worker_pool.cc"
        "src/service/ipc_server.cc"
        "src/service/task_protocol.cc"
        "src/service/config_loader.cc"
    )

    add_executable(leapvm_server ${LEAPVM_SERVER_SOURCES} ${LEAPVM_CORE_SOURCES})

    target_include_directories(leapvm_server PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/include"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/leapvm"
        "${CMAKE_CURRENT_SOURCE_DIR}/third_party/uWebSockets/src"
    )

    target_compile_definitions(leapvm_server PRIVATE
        LEAPVM_STANDALONE=1
        V8_COMPRESS_POINTERS
        V8_ENABLE_SANDBOX
        V8_STATIC_LIBRARY
        V8_ENABLE_I18N_SUPPORT
        UNICODE
        UWS_NO_ZLIB=1
    )

    if(WIN32)
        target_link_libraries(leapvm_server PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib/v8_monolith.lib"
            usockets
            winmm dbghelp ws2_32
        )

        if(MSVC)
            target_compile_options(leapvm_server PRIVATE /MT /Zc:__cplusplus /bigobj)
            set_target_properties(leapvm_server PROPERTIES
                LINK_FLAGS "/WHOLEARCHIVE:${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/lib/v8_monolith.lib"
            )
        endif()
    else()
        target_link_libraries(leapvm_server PRIVATE
            "${V8_LIB_PATH}"
            usockets
            pthread
            dl
        )

        # libc++ 链接（与 V8 ABI 保持一致）
        if(EXISTS "${V8_LIBCXX_PATH}" AND EXISTS "${V8_LIBCXXABI_PATH}")
            target_link_libraries(leapvm_server PRIVATE
                "${V8_LIBCXX_PATH}" "${V8_LIBCXXABI_PATH}"
            )
            if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
                if(EXISTS "${V8_LIBCXX_INCLUDE_DIR}" AND EXISTS "${V8_LIBCXXABI_INCLUDE_DIR}")
                    target_include_directories(leapvm_server SYSTEM PRIVATE
                        "${V8_LIBCXX_INCLUDE_DIR}"
                        "${V8_LIBCXXABI_INCLUDE_DIR}"
                    )
                    target_compile_definitions(leapvm_server PRIVATE
                        _LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_NONE
                    )
                    target_compile_options(leapvm_server PRIVATE -stdlib=libc++)
                endif()
            endif()
        endif()

        # ThinLTO
        if(LEAPVM_ENABLE_LTO AND CMAKE_CXX_COMPILER_ID MATCHES "Clang")
            target_compile_options(leapvm_server PRIVATE -flto=thin)
            target_link_options(leapvm_server PRIVATE -flto=thin -fuse-ld=lld)
        endif()

        target_link_options(leapvm_server PRIVATE
            "-Wl,-Bsymbolic"
        )
    endif()

    # Lexbor
    if(LEAPVM_ENABLE_LEXBOR AND TARGET lexbor_static)
        target_link_libraries(leapvm_server PRIVATE lexbor_static)
        target_compile_definitions(leapvm_server PRIVATE LEAPVM_HAS_LEXBOR=1)
    else()
        target_compile_definitions(leapvm_server PRIVATE LEAPVM_HAS_LEXBOR=0)
    endif()

    # nlohmann/json (header-only)
    set(NLOHMANN_JSON_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/nlohmann")
    if(EXISTS "${NLOHMANN_JSON_DIR}/json.hpp")
        target_include_directories(leapvm_server PRIVATE "${NLOHMANN_JSON_DIR}")
        message(STATUS "nlohmann/json found at: ${NLOHMANN_JSON_DIR}")
    else()
        message(STATUS "nlohmann/json not found at ${NLOHMANN_JSON_DIR}, will download if needed")
    endif()

    message(STATUS "leapvm_server target configured successfully")
endif()
