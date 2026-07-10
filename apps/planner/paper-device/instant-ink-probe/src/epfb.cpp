#include "epframebuffer.h"
#include <dlfcn.h>
#include <iostream>
#include <map>
#include <QImage>

typedef EPFramebuffer* (*InstanceFn)();
typedef void (*SwapBuffersFn)(EPFramebuffer*, QRect, EPContentType, EPScreenMode, QFlags<EPFramebuffer::UpdateFlag>);

#define ORG(x, ret) ret (*org)(...) = NULL; if(org == NULL) org = (ret (*)(...)) dlsym(RTLD_NEXT, x)

static void* loadLibrary() {
    static void* handle = nullptr;
    if (!handle) {
        handle = dlopen("/usr/lib/plugins/scenegraph/libqsgepaper.so", RTLD_LAZY | RTLD_GLOBAL);
        if (!handle) {
            std::cerr << "Failed to load libqsgepaper.so: " << dlerror() << std::endl;
        }
    }
    return handle;
}

static int intercept_state = 0;
QImage* g_mainFramebuffer = nullptr;
QImage* g_auxFramebuffer = nullptr;

namespace {
struct CapturedImage {
    uchar* data = nullptr;
    int width = 0;
    int height = 0;
    qsizetype bytesPerLine = 0;
    QImage::Format format = QImage::Format_Invalid;
};

CapturedImage g_rgb32Capture;
CapturedImage g_grayCapture;
QImage g_rgb32View;
QImage g_grayView;
}

extern "C" void _ZN6QImageC1EPhiixNS_6FormatEPFvPvES2_(QImage *that, uchar *data, int width, int height, qsizetype bytesPerLine, QImage::Format format, void (*cleanupFunction)(void*), void* cleanupInfo) {
    ORG("_ZN6QImageC1EPhiixNS_6FormatEPFvPvES2_", void);
    org(that, data, width, height, bytesPerLine, format, cleanupFunction, cleanupInfo);
    if(intercept_state == 1) {
        CapturedImage c{data, width, height, bytesPerLine, format};
        if (format == QImage::Format_RGB32) {
            g_rgb32Capture = c;
        } else if (format == QImage::Format_Grayscale8) {
            g_grayCapture = c;
        }
    }
}

EPFramebuffer* EPFramebuffer::instance() {
    void* handle = loadLibrary();
    if (!handle) return nullptr;
    
    InstanceFn fn = (InstanceFn)dlsym(handle, "_ZN13EPFramebuffer8instanceEv");
    if (!fn) return nullptr;
    
    intercept_state = 1;
    EPFramebuffer* inst = fn();
    intercept_state = 2;
    if (g_rgb32Capture.data) {
        g_rgb32View = QImage(g_rgb32Capture.data, g_rgb32Capture.width,
                             g_rgb32Capture.height, g_rgb32Capture.bytesPerLine,
                             g_rgb32Capture.format);
        g_mainFramebuffer = &g_rgb32View;
        std::cerr << "[Probe] RGB32 framebuffer "
                  << g_rgb32Capture.width << "x" << g_rgb32Capture.height
                  << " bpl=" << g_rgb32Capture.bytesPerLine << std::endl;
    }
    if (g_grayCapture.data) {
        g_grayView = QImage(g_grayCapture.data, g_grayCapture.width,
                            g_grayCapture.height, g_grayCapture.bytesPerLine,
                            g_grayCapture.format);
        g_auxFramebuffer = &g_grayView;
        std::cerr << "[Probe] Grayscale framebuffer "
                  << g_grayCapture.width << "x" << g_grayCapture.height
                  << " bpl=" << g_grayCapture.bytesPerLine << std::endl;
    }
    return inst;
}

void EPFramebuffer::swapBuffers(QRect rect, EPContentType type, EPScreenMode mode, QFlags<UpdateFlag> flags) {
    void* handle = loadLibrary();
    if (!handle) return;
    SwapBuffersFn fn = (SwapBuffersFn)dlsym(handle, "_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE");
    if (fn) {
        fn(this, rect, type, mode, flags);
    }
}
