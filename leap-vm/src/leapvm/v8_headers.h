#pragma once

// 【核心修正】强制定义静态库宏
// 这告诉编译器：不要去 DLL 里找函数，函数就在我肚子里！
#ifndef V8_STATIC_LIBRARY
#define V8_STATIC_LIBRARY 1
#endif

// 指针压缩和沙箱必须与 v8_monolith 编译时保持一致
#ifndef V8_COMPRESS_POINTERS
#define V8_COMPRESS_POINTERS 1
#endif

#ifndef V8_ENABLE_SANDBOX
#define V8_ENABLE_SANDBOX 1
#endif

#include "libplatform/libplatform.h"
#include "v8.h"