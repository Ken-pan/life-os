#pragma once
#include <QImage>
#include <QRect>
#include <QFlags>
#include <QString>
#include <QVector>

// Enum values VERIFIED 2026-07-10 against asivery/epfb-re (the recovered
// vendor ABI) and cross-checked with MaximeRivest/riddle's quill engine,
// which live-draws on this exact panel. The previous placeholder values were
// wrong in every position: "Mono=1" actually selected Color, and flag 0x1
// ("WaitFramebufferObject") actually requested CompleteRefresh — a full
// flashing refresh on every swap.
enum class EPContentType { Mono = 0, Color = 1 };
enum class EPScreenMode {
    QualityFastest = 0,   // live ink: partial, non-flashing, lowest latency
    QualityFast = 1,
    Quality3 = 3,         // page-level redraws
    QualityFull = 4,
    Quality5 = 5,
};

class EPFramebuffer {
public:
    enum UpdateFlag { NoRefresh = 0x0, CompleteRefresh = 0x1 };
    Q_DECLARE_FLAGS(UpdateFlags, UpdateFlag)

    static EPFramebuffer* instance();
    void sendSwap(QRect rect, EPContentType type, EPScreenMode mode, QFlags<UpdateFlag> flags);
};

// One captured full-screen QImage that the vendor scenegraph created. We
// record every discriminating signal the Phase 2B-0 directive requires so a
// buffer is identified by provenance and lifetime, never by dimensions alone.
struct FramebufferCandidate {
    quintptr objectAddr = 0;   // &QImage
    quintptr dataAddr = 0;     // bits()
    int width = 0;
    int height = 0;
    int format = -1;
    qsizetype bytesPerLine = 0;
    QString callerSo;          // dladdr() of constructor return address
    QString source;            // "qimage-ctor" | "setBuffers-tuple0/1" | "setBuffers-aux"
    bool alive = true;
};

// Diagnostic-only entry points. Active solely when PAPEROS_DIRECT_DIAG=1.
namespace DirectInkDiag {
    void install();                 // arm interposer logging
    void armCapture();              // arm candidate capture unconditionally (native ink runtime)
    void runStartupGate(int argc, char** argv);  // resolve buffer + Test A (memory)
    void runTestAHold();            // redraw+swap the deterministic line once (call on a timer)
    bool ready();                   // draw buffer resolved
    void resolveInto();             // build the QImage view over the resolved buffer
    const QVector<FramebufferCandidate>& candidates();
}

// Rejected Qt/direct hybrid path. Kept only for forensic comparison behind
// PAPEROS_REJECTED_HYBRID_DIRECT_INK=1. It is not a product architecture;
// PaperOS Notes targets a separate native takeover ink runtime.
namespace DirectInk {
    bool enabled();                 // rejected-hybrid env flag and buffer resolved
    void resolveBuffer();           // pick the RGB32 vendor buffer (idempotent)
    bool isReady();
    void beginStroke();
    void segment(int x0, int y0, int x1, int y1, int radius, bool eraser);  // screen coords
    void endStroke();               // final swap over the stroke bounds
}

extern QImage* g_drawBuffer;        // the resolved RGB32 draw target, or null
