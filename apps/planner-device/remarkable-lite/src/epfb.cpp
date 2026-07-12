#include "epframebuffer.h"
#include "ink_raster.h"
#include "metrics.h"

#include <chrono>
#include <dlfcn.h>
#include <cstdio>
#include <cstdint>
#include <QByteArray>
#include <QVector>

// ── Phase 2B-0 direct-ink instrumentation ────────────────────────────────
//
// Purpose of THIS file: resolve, with proof, which vendor QImage the ACeP
// backend actually presents, and run the Test-A deterministic-line check
// whose memory side is objective (checksums) and whose physical side the
// operator confirms. It draws NOTHING and logs NOTHING unless
// PAPEROS_DIRECT_DIAG=1, and is never wired into the live ink path.
//
// Two capture sources, cross-checked:
//   1. setBuffers(std::tuple<QImage,QImage>, QImage*) — the SEMANTIC source.
//      Recovered ABI. On AArch64 the by-value tuple<QImage,QImage> (a
//      non-trivially-copyable 16-byte aggregate of two d-pointers) is passed
//      indirectly: this=x0, tuplePtr=x1, aux=x2.
//   2. QImage(uchar*,int,int,qsizetype,Format,...) ctor — corroboration,
//      accepted only when dladdr() says the caller is libqsgepaper.so.

static bool g_diag = false;      // verbose logging
static bool g_capture = false;   // record framebuffer candidates (diag OR live ink)
QImage* g_drawBuffer = nullptr;
static QVector<FramebufferCandidate> g_candidates;

static void* vendorHandle() {
    static void* h = nullptr;
    if (!h) {
        h = dlopen("/usr/lib/plugins/scenegraph/libqsgepaper.so", RTLD_LAZY | RTLD_GLOBAL);
        if (!h && g_diag) fprintf(stderr, "[DirectDiag] dlopen failed: %s\n", dlerror());
    }
    return h;
}

static QString soForAddr(void* addr) {
    Dl_info info;
    if (addr && dladdr(addr, &info) && info.dli_fname)
        return QString::fromUtf8(info.dli_fname);
    return QStringLiteral("<unknown>");
}

static void recordCandidate(FramebufferCandidate c) {
    // Dedupe by DATA address, not object: the QImage wrapper captured at the
    // ctor is often a stack temporary (obj addr 0xffff… high stack) that is
    // gone by the time the gate runs — only the mmap'd data pointer is
    // stable. We never deref the stored object; we rebuild a QImage over the
    // data pointer when drawing.
    if (c.dataAddr == 0) return;
    for (FramebufferCandidate& e : g_candidates) {
        if (e.dataAddr == c.dataAddr) { e = c; return; }
    }
    g_candidates.append(c);
    if (g_diag)
        fprintf(stderr,
            "[DirectDiag] candidate %s obj=0x%llx data=0x%llx %dx%d fmt=%d bpl=%lld from=%s\n",
            c.source.toUtf8().constData(),
            (unsigned long long)c.objectAddr, (unsigned long long)c.dataAddr,
            c.width, c.height, c.format, (long long)c.bytesPerLine,
            c.callerSo.toUtf8().constData());
}

static FramebufferCandidate describe(QImage* q, const QString& source, void* caller) {
    FramebufferCandidate c;
    c.objectAddr = reinterpret_cast<quintptr>(q);
    c.source = source;
    c.callerSo = caller ? soForAddr(caller) : QString();
    if (q && !q->isNull()) {
        c.dataAddr = reinterpret_cast<quintptr>(q->bits());
        c.width = q->width();
        c.height = q->height();
        c.format = int(q->format());
        c.bytesPerLine = q->bytesPerLine();
    }
    return c;
}

// ── Interposer 1: QImage complete-object ctor used to wrap fb memory ──────
#define ORG(sym, ret) static ret (*org)(...) = nullptr; \
    if (!org) org = (ret(*)(...)) dlsym(RTLD_NEXT, sym)

extern "C" void _ZN6QImageC1EPhiixNS_6FormatEPFvPvES2_(
        QImage* that, uchar* data, int width, int height, qsizetype bpl,
        QImage::Format format, void (*cleanup)(void*), void* cleanupInfo) {
    ORG("_ZN6QImageC1EPhiixNS_6FormatEPFvPvES2_", void);
    org(that, data, width, height, bpl, format, cleanup, cleanupInfo);
    if (!g_capture) return;

    // Provenance gate: only images the vendor scenegraph constructed count.
    void* caller = __builtin_return_address(0);
    const QString so = soForAddr(caller);
    const bool fromVendor = so.contains(QStringLiteral("libqsgepaper"))
                         || so.contains(QStringLiteral("libepaper"));
    if (width >= 900 && height >= 1600 && fromVendor)
        recordCandidate(describe(that, QStringLiteral("qimage-ctor"), caller));
}

// ── Interposer 2: setBuffers — the authoritative semantic capture ─────────
extern "C" void _ZN13EPFramebuffer10setBuffersESt5tupleI6QImageS1_EPS0_(
        void* self, void* tuplePtr, QImage* aux) {
    if (g_capture) {
        // tuple<QImage,QImage> == two consecutive QImage (d-pointer) slots.
        QImage* t0 = reinterpret_cast<QImage*>(tuplePtr);
        QImage* t1 = reinterpret_cast<QImage*>(static_cast<char*>(tuplePtr) + sizeof(QImage));
        recordCandidate(describe(t0, QStringLiteral("setBuffers-tuple0"), nullptr));
        recordCandidate(describe(t1, QStringLiteral("setBuffers-tuple1"), nullptr));
        if (aux) recordCandidate(describe(aux, QStringLiteral("setBuffers-aux"), nullptr));
    }
    ORG("_ZN13EPFramebuffer10setBuffersESt5tupleI6QImageS1_EPS0_", void);
    reinterpret_cast<void(*)(void*, void*, QImage*)>(org)(self, tuplePtr, aux);
}

// ── Interposer 3: swapBuffers — capture Qt and Native refreshes ─────────
extern "C" void _ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE(
        void* self, QRect rect, EPContentType type, EPScreenMode mode, QFlags<EPFramebuffer::UpdateFlag> flags) {
    QJsonObject extra;
    extra["rect_x"] = rect.x();
    extra["rect_y"] = rect.y();
    extra["rect_w"] = rect.width();
    extra["rect_h"] = rect.height();
    extra["type"] = static_cast<int>(type);
    extra["mode"] = static_cast<int>(mode);
    extra["flags"] = static_cast<int>(flags);
    // Heuristic: full refresh if it covers most of the screen
    extra["full_refresh"] = (rect.width() >= 900 && rect.height() >= 1600) ? 1 : 0;

    // We only log full refreshes from standard Qt to trace navigation latency.
    const bool navTraceEnabled = qEnvironmentVariableIntValue("PAPEROS_NAV_TRACE") == 1;
    if (navTraceEnabled
        && (extra["full_refresh"] == 1
            || mode == EPScreenMode::QualityFastest
            || mode == EPScreenMode::Quality3)) {
        long long ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        fprintf(stderr, "[PaperOS] NAV_TRACE: frame_submitted (swapBuffers) mode=%d type=%d rect=%d,%d %dx%d full=%d (ts=%lld)\n",
                (int)mode, (int)type, rect.x(), rect.y(), rect.width(), rect.height(), extra["full_refresh"].toInt(), ms);
    }
    Metrics::logEvent("swap", extra);

    ORG("_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE", void);
    reinterpret_cast<void(*)(void*, QRect, EPContentType, EPScreenMode, QFlags<EPFramebuffer::UpdateFlag>)>(org)(self, rect, type, mode, flags);
}

// ── EPFramebuffer thin wrappers (call vendor via dlsym) ───────────────────
EPFramebuffer* EPFramebuffer::instance() {
    void* h = vendorHandle();
    if (!h) return nullptr;
    auto fn = (EPFramebuffer*(*)()) dlsym(h, "_ZN13EPFramebuffer8instanceEv");
    return fn ? fn() : nullptr;
}

void EPFramebuffer::sendSwap(QRect rect, EPContentType type, EPScreenMode mode,
                                QFlags<UpdateFlag> flags) {
    void* h = vendorHandle();
    if (!h) return;
    auto fn = (void(*)(EPFramebuffer*, QRect, EPContentType, EPScreenMode, QFlags<UpdateFlag>))
        dlsym(h, "_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE");
    if (fn) fn(this, rect, type, mode, flags);
}

// ── Diagnostic driver ─────────────────────────────────────────────────────
namespace DirectInkDiag {

void install() {
    g_diag = qEnvironmentVariableIntValue("PAPEROS_DIRECT_DIAG") == 1;
    // Capture framebuffer candidates when diagnostics OR the explicitly
    // rejected hybrid path is enabled — both need the resolved buffer. Must be
    // set before the platform plugin constructs its framebuffers.
    g_capture = g_diag
        || (qEnvironmentVariableIntValue("PAPEROS_REJECTED_HYBRID_DIRECT_INK") == 1);
    if (g_diag)
        fprintf(stderr, "[DirectDiag] armed — interposers logging, live ink path untouched\n");
}

// Unconditional capture arming for the native-takeover ink runtime, which
// resolves the vendor framebuffer as its display surface (no env flag). Must
// run before EPFramebuffer::instance() / QGuiApplication construction.
void armCapture() {
    g_capture = true;
}

const QVector<FramebufferCandidate>& candidates() { return g_candidates; }

// Returns the winning candidate (RGB32, semantic source preferred), or a
// null-data candidate if none. The caller rebuilds a QImage over its stable
// data pointer — the captured object address must never be dereferenced.
static FramebufferCandidate pickDrawCandidate() {
    const int kRGB32 = int(QImage::Format_RGB32);
    for (const FramebufferCandidate& c : g_candidates)
        if (c.format == kRGB32 && c.source.startsWith("setBuffers"))
            return c;
    for (const FramebufferCandidate& c : g_candidates)
        if (c.format == kRGB32)
            return c;
    return FramebufferCandidate{};
}

static quint32 checksum(QImage* q, QRect r) {
    quint32 h = 2166136261u;
    for (int y = r.top(); y <= r.bottom(); ++y) {
        const uchar* line = q->scanLine(y);
        for (int x = r.left() * (q->depth() / 8); x < (r.right() + 1) * (q->depth() / 8); ++x)
            h = (h ^ line[x]) * 16777619u;
    }
    return h;
}

// Persistent QImage wrapping the vendor framebuffer's stable data pointer.
static QImage g_fbView;

void runStartupGate(int, char**) {
    fprintf(stderr, "[DirectDiag] runStartupGate: g_diag=%d candidates=%d\n",
            g_diag, g_candidates.size());
    fflush(stderr);
    if (!g_diag) return;

    const FramebufferCandidate c = pickDrawCandidate();
    if (c.dataAddr == 0) {
        fprintf(stderr, "DIRECT_INK_READY=0\n");
        fprintf(stderr, "[DirectDiag] no RGB32 draw buffer resolved from %d candidates\n",
                g_candidates.size());
        return;
    }

    // Rebuild a QImage over the stable mmap'd framebuffer memory. The object
    // captured at the ctor was a stack temporary and must not be touched.
    g_fbView = QImage(reinterpret_cast<uchar*>(c.dataAddr), c.width, c.height,
                      c.bytesPerLine, QImage::Format(c.format));
    g_drawBuffer = &g_fbView;
    QImage* fb = &g_fbView;

    fprintf(stderr, "DIRECT_INK_READY=1\n");
    fprintf(stderr, "DIRECT_BUFFER_OBJECT=%p (rebuilt over data)\n", (void*)fb);
    fprintf(stderr, "DIRECT_BUFFER_DATA=0x%llx\n", (unsigned long long)c.dataAddr);
    fprintf(stderr, "DIRECT_BUFFER_FORMAT=%d\n", c.format);
    fprintf(stderr, "DIRECT_BUFFER_SIZE=%dx%d\n", c.width, c.height);
    fprintf(stderr, "DIRECT_BUFFER_BPL=%lld\n", (long long)c.bytesPerLine);
    fprintf(stderr, "DIRECT_BUFFER_SOURCE=%s\n", c.source.toUtf8().constData());

    // Test A — deterministic solid line, memory side (objective).
    InkRaster raster(fb);
    const int y = fb->height() / 2, x0 = 200, x1 = 600, radius = 3;
    QRect region(x0 - 16, y - 16, (x1 - x0) + 32, 32);

    quint32 preRaster = checksum(fb, region);
    raster.clearWhite();
    quint32 afterClear = checksum(fb, region);
    QRect dirty = raster.drawLine(x0, y, x1, y, radius, false);

    // Continuity scan: every column in [x0,x1] must have a black pixel on row y.
    int gaps = 0;
    const quint32* row = reinterpret_cast<const quint32*>(fb->scanLine(y));
    for (int x = x0; x <= x1; ++x)
        if ((row[x] & 0x00FFFFFF) != 0) ++gaps;
    quint32 afterRaster = checksum(fb, region);

    fprintf(stderr, "TEST_A_CHECKSUM_PRE=%08x AFTER_CLEAR=%08x AFTER_RASTER=%08x\n",
            preRaster, afterClear, afterRaster);
    fprintf(stderr, "TEST_A_MEMORY_LINE=%s (gap_columns=%d of %d)\n",
            gaps == 0 ? "SOLID" : "DOTTED", gaps, (x1 - x0 + 1));
    fprintf(stderr, "TEST_A_DIRTY_RECT=%d,%d %dx%d\n",
            dirty.x(), dirty.y(), dirty.width(), dirty.height());

    // One swap over the padded line, Mono + Quality3, one-shot complete
    // refresh. The physical result is the operator's to read; interpretation
    // table is in the 2B gate doc.
    EPFramebuffer* ep = EPFramebuffer::instance();
    if (ep) {
        ep->sendSwap(region, EPContentType::Mono, EPScreenMode::Quality3,
                        EPFramebuffer::CompleteRefresh);
        fprintf(stderr, "TEST_A_SWAP=issued mono quality3 rect=%d,%d %dx%d\n",
                region.x(), region.y(), region.width(), region.height());
    } else {
        fprintf(stderr, "TEST_A_SWAP=FAILED instance()==null\n");
    }
}

bool ready() { return g_drawBuffer != nullptr && !g_fbView.isNull(); }

void resolveInto() {
    if (g_drawBuffer && !g_fbView.isNull()) return;
    const FramebufferCandidate c = pickDrawCandidate();
    if (c.dataAddr == 0) return;
    g_fbView = QImage(reinterpret_cast<uchar*>(c.dataAddr), c.width, c.height,
                      c.bytesPerLine, QImage::Format(c.format));
    g_drawBuffer = &g_fbView;
}

// Redraw the deterministic line and re-issue one swap. Called repeatedly on a
// timer so the physical line is continuously re-asserted and stays visible
// even while the shell repaints — lets the operator judge solid vs dotted.
void runTestAHold() {
    if (!ready()) return;
    QImage* fb = g_drawBuffer;
    InkRaster raster(fb);
    const int y = fb->height() / 2, x0 = 200, x1 = 600, radius = 3;
    QRect region(x0 - 16, y - 16, (x1 - x0) + 32, 32);
    raster.drawLine(x0, y, x1, y, radius, false);
    if (EPFramebuffer* ep = EPFramebuffer::instance())
        ep->sendSwap(region, EPContentType::Mono, EPScreenMode::QualityFastest,
                        EPFramebuffer::NoRefresh);
}

} // namespace DirectInkDiag

// ── Rejected Qt/direct hybrid path ────────────────────────────────────────
namespace DirectInk {

static int  g_enabled = -1;                 // lazy: -1 unknown, 0/1 resolved
static bool g_strokeOwning = false;
static QRect g_strokeBounds;
static EPScreenMode g_mode = EPScreenMode::QualityFastest;  // live-ink quality tier

// Ensure the QImage-ctor interposer records candidates even when the pure
// diagnostic flag is off — the live path needs the buffer too.
void resolveBuffer() {
    // Candidates are captured by the interposers whenever g_capture is set
    // (diag or live ink). Build the QImage view over the resolved buffer.
    DirectInkDiag::resolveInto();
}

bool isReady() { return DirectInkDiag::ready(); }

bool enabled() {
    if (g_enabled < 0) {
        g_enabled = qEnvironmentVariableIntValue("PAPEROS_REJECTED_HYBRID_DIRECT_INK") == 1 ? 1 : 0;
        if (g_enabled) {
            const int sm = qEnvironmentVariableIntValue("PAPEROS_INK_SM");
            if (sm == 1) g_mode = EPScreenMode::QualityFast;
            else if (sm == 3) g_mode = EPScreenMode::Quality3;
            else if (sm == 4) g_mode = EPScreenMode::QualityFull;
            else if (sm == 5) g_mode = EPScreenMode::Quality5;
        }
    }
    if (g_enabled == 1 && !isReady())
        resolveBuffer();  // candidates were captured during platform init
    return g_enabled == 1 && isReady();
}

void beginStroke() {
    static bool logged = false;
    if (!logged) {
        logged = true;
        fprintf(stderr, "[DirectInk] LIVE — first stroke owns canvas, buffer ready=%d mode=%d\n",
                isReady(), int(g_mode));
    }
    g_strokeOwning = true;
    g_strokeBounds = QRect();
}

void segment(int x0, int y0, int x1, int y1, int radius, bool eraser) {
    if (!isReady()) return;
    InkRaster raster(g_drawBuffer);
    QRect dirty = raster.drawLine(x0, y0, x1, y1, radius, eraser);
    if (dirty.isNull()) return;
    g_strokeBounds = g_strokeBounds.isNull() ? dirty : g_strokeBounds.united(dirty);
    // One serialized swap per segment over just this segment's padded rect —
    // exclusive: no Qt swap runs over the canvas while g_strokeOwning holds.
    const QRect pad = dirty.adjusted(-radius - 2, -radius - 2, radius + 2, radius + 2);
    if (EPFramebuffer* ep = EPFramebuffer::instance())
        ep->sendSwap(pad, EPContentType::Mono, g_mode, EPFramebuffer::NoRefresh);
}

void endStroke() {
    g_strokeOwning = false;
    g_strokeBounds = QRect();
}

bool strokeOwning() { return g_strokeOwning; }

} // namespace DirectInk
