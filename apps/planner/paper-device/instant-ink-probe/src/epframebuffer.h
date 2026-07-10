#pragma once
#include <QImage>
#include <QRect>
#include <QRegion>
#include <QFlags>

enum class EPContentType {
    Mono = 0,
    Text = 1,
    Image = 2
};

enum class EPScreenMode {
    Mode0 = 0,
    Mode1 = 1,
    HighQuality = 3
};

class EPFramebuffer {
public:
    enum UpdateFlag {
        WaitFramebufferObject = 0x1,
    };
    Q_DECLARE_FLAGS(UpdateFlags, UpdateFlag)

    static EPFramebuffer* instance();
    void swapBuffers(QRect rect, EPContentType type, EPScreenMode mode, QFlags<UpdateFlag> flags);
};

extern QImage* g_mainFramebuffer;
extern QImage* g_auxFramebuffer;
