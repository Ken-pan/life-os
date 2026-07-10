// paperos-ink-runtime — the PaperOS native ink mode host.
//
// Spawned by the shell's InkModeController for one note session: takes over
// the vendor framebuffer exclusively (same proven path as paperos-ink-live),
// loads the note's page raster, writes with pressure ink, and exits back to
// the shell when the pen taps the Back zone. The shell keeps running but must
// not swap while this process owns the display.
//
// Env contract:
//   PAPEROS_NOTE_DIR          note directory (page-001.png is loaded/saved)
//   PAPEROS_MARKER_DEVICE     default /dev/input/event2
//   PAPEROS_TEST_BRIDGE_PORT  dev-inspection bridge, default 18770 (shell owns 18765)
#include <QGuiApplication>
#include <QPainter>
#include <QImage>
#include <QTimer>
#include <QFile>
#include <QDir>
#include <QFontDatabase>
#include <QSocketNotifier>
#include <QFont>
#include <csignal>
#include <fcntl.h>
#include <unistd.h>
#include "EvdevMarkerSource.h"
#include "LiveTestBridge.h"
#include "../PerfLog.h"
#include "../epframebuffer.h"
#include "DisplayScheduler.h"

QImage* g_inkGoldBuffer = nullptr;

static const int kScreenW = 954;
static const int kScreenH = 1696;
static const int kHeaderH = 96;
static const QRect kBackZone(0, 0, 280, kHeaderH);

class InkRuntimeController : public QObject {
    Q_OBJECT
public:
    InkRuntimeController(QObject* parent = nullptr) : QObject(parent) {
        m_noteDir = qEnvironmentVariable("PAPEROS_NOTE_DIR");
        m_markerDevice = qEnvironmentVariable("PAPEROS_MARKER_DEVICE", "/dev/input/event2");
        m_noteId = QDir(m_noteDir).dirName();
    }

    void begin() {
        setState("PROCESS_STARTED");
        if (m_noteDir.isEmpty() || !QDir(m_noteDir).exists()) {
            fail("NOTE_DIR_INVALID: " + m_noteDir);
            return;
        }

        EPFramebuffer* ep = EPFramebuffer::instance();
        DirectInkDiag::resolveInto();
        if (!ep || !DirectInkDiag::ready()) {
            fail(QStringLiteral("DISPLAY_ACQUIRE_FAILED (%1 candidates)")
                     .arg(DirectInkDiag::candidates().size()));
            return;
        }
        g_inkGoldBuffer = g_drawBuffer;
        setState("WINDOW_CREATED");

        DisplayScheduler::instance().presenter = [this](const QRect& r) {
            swapRect(r, EPScreenMode::QualityFastest, EPFramebuffer::NoRefresh);
        };

        drawPage();
        setState("INITIAL_PAINT_REQUESTED");
        PerfLog::instance().log("INITIAL_PAINT_EVENT_BEGIN");
        swapRect(QRect(0, 0, kScreenW, kScreenH), EPScreenMode::Quality3,
                 EPFramebuffer::CompleteRefresh);
        PerfLog::instance().log("INITIAL_PAINT_EVENT_END");
        setState("INITIAL_PAINT_COMPLETED");

        QTimer::singleShot(0, this, [this]() { initMarker(); });
    }

    void startBridge(quint16 port) {
        m_bridge = new LiveTestBridge(this);
        m_bridge->setStateProvider([this]() {
            QJsonObject o;
            o["live"] = m_state;
            o["failure"] = m_failure;
            o["pid"] = int(getpid());
            o["noteId"] = m_noteId;
            o["noteDir"] = m_noteDir;
            o["markerGrabbed"] = m_evdev ? m_evdev->grabbed() : false;
            o["displayPath"] = "direct-epframebuffer";
            return o;
        });
        m_bridge->setStopHandler([this]() { finish("bridge stop"); });
        m_bridge->setScreenshotHandler([](const QString& path) {
            return g_inkGoldBuffer && g_inkGoldBuffer->save(path);
        });
        if (!m_bridge->start(port))
            qWarning("ink-runtime bridge failed to listen on %u", port);
    }

    void shutdownFromSignal() {
        PerfLog::instance().log("SIGNAL_RECEIVED");
        finish("signal");
    }

private:
    void initMarker() {
        m_evdev = new EvdevMarkerSource(m_markerDevice, kScreenW, kScreenH, this);
        QString err;
        if (!m_evdev->start(&err)) {
            fail("MARKER_INIT_FAILED: " + err);
            return;
        }
        setState("MARKER_OPENED");
        setState("EVIOCGRAB_SUCCEEDED");
        setState("INPUT_RANGES_READ");

        QString detail;
        if (!m_evdev->validateMapping(&detail)) {
            fail("COORD_MAPPING_FAILED: " + detail);
            return;
        }

        // Toolbar hit-zone filter: pen-down inside the Back zone is a tap,
        // and anything in the header strip never inks.
        m_evdev->frameFilter = [this](const PenFrame& f) -> bool {
            if (f.touching && !m_penWasDown) {
                m_penWasDown = true;
                m_downInBackZone = kBackZone.contains(f.mappedX, f.mappedY);
            } else if (!f.touching && m_penWasDown) {
                m_penWasDown = false;
                if (m_downInBackZone && kBackZone.contains(f.mappedX, f.mappedY)) {
                    PerfLog::instance().log("BACK_TAP");
                    finish("back tap");
                    return true;
                }
                m_downInBackZone = false;
            }
            if (m_downInBackZone) return true;               // tap gesture, no ink
            if (f.touching && f.mappedY <= kHeaderH + 4) return true;  // header never inks
            return false;
        };

        m_evdev->setAcceptInput(true);
        setState("DISPLAY_READY");
        setState("LIVE_READY");
        setState("TEST_RUNNING");
    }

    void drawPage() {
        QPainter p(g_inkGoldBuffer);
        p.fillRect(g_inkGoldBuffer->rect(), Qt::white);

        // Restore the note's existing raster below the header, if any.
        const QString pagePath = m_noteDir + "/page-001.png";
        if (QFile::exists(pagePath)) {
            QImage prior(pagePath);
            if (!prior.isNull()) {
                p.drawImage(0, 0, prior, 0, 0, kScreenW, kScreenH);
                PerfLog::instance().log("NOTE_PAGE_RESTORED", {{"path", pagePath}});
            }
        }

        // Header toolbar, rasterized before marker input becomes active.
        p.fillRect(QRect(0, 0, kScreenW, kHeaderH), Qt::white);
        QFont f;
        f.setPixelSize(34);
        f.setBold(true);
        p.setFont(f);
        p.setPen(Qt::black);
        p.drawText(kBackZone.adjusted(24, 0, 0, 0), Qt::AlignLeft | Qt::AlignVCenter, "< Back");
        QFont f2;
        f2.setPixelSize(26);
        p.setFont(f2);
        p.drawText(QRect(kBackZone.right(), 0, kScreenW - kBackZone.right() - 24, kHeaderH),
                   Qt::AlignRight | Qt::AlignVCenter, m_noteId);
        p.fillRect(QRect(0, kHeaderH, kScreenW, 3), Qt::black);
    }

    bool savePage() {
        if (!g_inkGoldBuffer) return false;
        // Persist the visible page; the header is redrawn on every entry so
        // saving it too is harmless and keeps the raster a plain snapshot.
        const QString pagePath = m_noteDir + "/page-001.png";
        const bool ok = g_inkGoldBuffer->copy(0, 0, kScreenW, kScreenH).save(pagePath);
        PerfLog::instance().log(ok ? "NOTE_PAGE_SAVED" : "NOTE_PAGE_SAVE_FAILED",
                                {{"path", pagePath}});
        return ok;
    }

    void finish(const QString& why) {
        if (m_finishing) return;
        m_finishing = true;
        PerfLog::instance().log("TEST_COMPLETE_TRIGGER", {{"reason", why}});
        setState("TEST_COMPLETE");
        savePage();
        setState("RECOVERING");
        releaseMarker();
        exitApp(0);
    }

    void fail(const QString& reason) {
        m_failure = reason;
        PerfLog::instance().log("LIVE_FAILURE", {{"reason", reason}, {"state", m_state}});
        fprintf(stderr, "LIVE_FAILURE state=%s reason=%s\n",
                m_state.toUtf8().constData(), reason.toUtf8().constData());
        setState("RECOVERING");
        releaseMarker();
        exitApp(2);
    }

    void releaseMarker() {
        if (m_evdev) {
            m_evdev->setAcceptInput(false);
            delete m_evdev;
            m_evdev = nullptr;
        }
    }

    void exitApp(int code) {
        QTimer::singleShot(0, [code]() { QCoreApplication::exit(code); });
    }

    void swapRect(const QRect& r, EPScreenMode mode, EPFramebuffer::UpdateFlag flag) {
        if (EPFramebuffer* ep = EPFramebuffer::instance())
            ep->sendSwap(r, EPContentType::Mono, mode, flag);
    }

    void setState(const QString& s) {
        m_state = s;
        PerfLog::instance().log("STATE", {{"state", s}});
    }

    QString m_state = "PROCESS_STARTED";
    QString m_failure;
    QString m_noteDir;
    QString m_noteId;
    QString m_markerDevice;
    bool m_finishing = false;
    bool m_penWasDown = false;
    bool m_downInBackZone = false;
    EvdevMarkerSource* m_evdev = nullptr;
    LiveTestBridge* m_bridge = nullptr;
};

static int g_sigPipe[2] = {-1, -1};

static void runtimeSignalHandler(int) {
    const char c = 1;
    ssize_t ignored = write(g_sigPipe[1], &c, 1);
    (void)ignored;
}

int main(int argc, char* argv[]) {
    DirectInkDiag::armCapture();

    qputenv("QT_QPA_PLATFORM", "epaper");
    QGuiApplication app(argc, argv);
    QFontDatabase::addApplicationFont("/home/root/paperos/fonts/NotoSansCJKsc-Regular.otf");

    InkRuntimeController controller;

    if (pipe(g_sigPipe) == 0) {
        fcntl(g_sigPipe[0], F_SETFL, O_NONBLOCK);
        fcntl(g_sigPipe[1], F_SETFL, O_NONBLOCK);
        std::signal(SIGINT, runtimeSignalHandler);
        std::signal(SIGTERM, runtimeSignalHandler);
        auto* notifier = new QSocketNotifier(g_sigPipe[0], QSocketNotifier::Read, &app);
        QObject::connect(notifier, &QSocketNotifier::activated, [&controller]() {
            char buf[16];
            while (read(g_sigPipe[0], buf, sizeof(buf)) > 0) {}
            controller.shutdownFromSignal();
        });
    }

    quint16 port = quint16(qEnvironmentVariableIntValue("PAPEROS_TEST_BRIDGE_PORT"));
    if (port == 0) port = 18770;
    controller.startBridge(port);
    controller.begin();

    return app.exec();
}

#include "main_runtime.moc"
