// paperos-ink-live — native takeover live ink candidate.
//
// Display path: the vendor RGB32 framebuffer resolved through the epfb.cpp
// interposers (armCapture → EPFramebuffer::instance() → resolveInto), with
// direct EPFramebuffer::swapBuffers calls. This is the only path with a
// physically confirmed panel result (Test A, 2026-07-09); QRasterWindow
// backing-store flushes never reach the panel on this device.
#include <QGuiApplication>
#include <QPainter>
#include <QImage>
#include <QTimer>
#include <QElapsedTimer>
#include <QFile>
#include <QDir>
#include <QFontDatabase>
#include <QJsonDocument>
#include <QJsonObject>
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

QImage* g_inkGoldBuffer = nullptr;   // points at the resolved vendor buffer view

static const int kScreenW = 954;     // visible width (buffer is allocated 960 wide)
static const int kScreenH = 1696;
static const QRect kContactIndicatorRect(20, 16, 420, 56);
static const char* kReadyScreenshotPath = "/tmp/paperos-test-driver/live-ready.png";
static const char* kFinalScreenshotPath = "/tmp/paperos-test-driver/live-final.png";

// Waveform tiers per the verified epfb-re ABI (see epframebuffer.h): live
// ink uses QualityFastest + NoRefresh (partial, non-flashing — the exact
// combination Riddle's quill engine uses for pen strokes on this panel);
// full-page redraws use Quality3 + one CompleteRefresh. The earlier flashing
// was caused by the old placeholder enums: every stroke swap was actually
// requesting Color content with CompleteRefresh.
static EPScreenMode modeFromEnv(const char* var, int defaultMode) {
    bool ok = false;
    int v = qEnvironmentVariableIntValue(var, &ok);
    if (!ok) v = defaultMode;
    switch (v) {
    case 1: return EPScreenMode::QualityFast;
    case 3: return EPScreenMode::Quality3;
    case 4: return EPScreenMode::QualityFull;
    case 5: return EPScreenMode::Quality5;
    default: return EPScreenMode::QualityFastest;
    }
}

class LiveInkController : public QObject {
    Q_OBJECT
public:
    LiveInkController(QObject* parent = nullptr) : QObject(parent) {
        m_durationS = qEnvironmentVariableIntValue("PAPEROS_TEST_DURATION_S");
        if (m_durationS <= 0) m_durationS = 120;
        m_markerDevice = qEnvironmentVariable("PAPEROS_MARKER_DEVICE", "/dev/input/event2");
        m_liveMode = modeFromEnv("PAPEROS_INK_SM", 0);   // QualityFastest
        m_pageMode = modeFromEnv("PAPEROS_PAGE_SM", 3);  // Quality3
        readBuildInfo();
    }

    void begin() {
        setState("PROCESS_STARTED");
        QDir().mkpath("/tmp/paperos-test-driver");

        if (!acquireDisplay()) return;  // fail() already ran
        setState("WINDOW_CREATED");     // display surface acquired

        DisplayScheduler::instance().presenter = [this](const QRect& r) {
            swapRect(r, m_liveMode, EPFramebuffer::NoRefresh);
        };

        drawStatusPage(false);
        setState("INITIAL_PAINT_REQUESTED");
        PerfLog::instance().log("INITIAL_UPDATE_REQUEST");
        PerfLog::instance().log("INITIAL_PAINT_EVENT_BEGIN");
        swapRect(QRect(0, 0, kScreenW, kScreenH), m_pageMode, EPFramebuffer::CompleteRefresh);
        PerfLog::instance().log("INITIAL_PAINT_EVENT_END");
        setState("INITIAL_PAINT_COMPLETED");

        QTimer::singleShot(0, this, [this]() { initMarker(); });
    }

    void startBridge(quint16 port) {
        m_bridge = new LiveTestBridge(this);
        m_bridge->setStateProvider([this]() { return stateJson(); });
        m_bridge->setStopHandler([this]() { complete("bridge stop"); });
        m_bridge->setScreenshotHandler([](const QString& path) {
            return g_inkGoldBuffer && g_inkGoldBuffer->save(path);
        });
        if (m_bridge->start(port)) {
            qWarning("LiveTestBridge listening on %u", port);
        } else {
            qWarning("LiveTestBridge FAILED to listen on %u", port);
        }
    }

    void shutdownFromSignal() {
        PerfLog::instance().log("SIGNAL_RECEIVED");
        setState("RECOVERING");
        releaseMarker();
        exitApp(1);
    }

private:
    bool acquireDisplay() {
        // Capture was armed in main() before QGuiApplication; instance()
        // forces the vendor to construct its framebuffers if the platform
        // plugin has not already.
        EPFramebuffer* ep = EPFramebuffer::instance();
        DirectInkDiag::resolveInto();
        if (!ep) {
            fail("DISPLAY_ACQUIRE_FAILED: EPFramebuffer::instance() is null (libqsgepaper missing?)");
            return false;
        }
        if (!DirectInkDiag::ready()) {
            fail(QStringLiteral("DISPLAY_ACQUIRE_FAILED: no RGB32 vendor buffer resolved (%1 candidates)")
                     .arg(DirectInkDiag::candidates().size()));
            return false;
        }
        g_inkGoldBuffer = g_drawBuffer;
        PerfLog::instance().log("DISPLAY_BUFFER_RESOLVED", {
            {"width", g_inkGoldBuffer->width()},
            {"height", g_inkGoldBuffer->height()},
            {"bytes_per_line", qint64(g_inkGoldBuffer->bytesPerLine())},
            {"format", int(g_inkGoldBuffer->format())},
        });
        return true;
    }

    void swapRect(const QRect& r, EPScreenMode mode, EPFramebuffer::UpdateFlag flag) {
        if (EPFramebuffer* ep = EPFramebuffer::instance()) {
            ep->sendSwap(r, EPContentType::Mono, mode, flag);
        }
    }

    void initMarker() {
        m_evdev = new EvdevMarkerSource(m_markerDevice, kScreenW, kScreenH, this);
        QString err;
        if (!m_evdev->start(&err)) {
            fail("MARKER_INIT_FAILED: " + err);
            return;
        }
        // start() succeeding implies open + grab + ranges, in that order.
        setState("MARKER_OPENED");
        setState("EVIOCGRAB_SUCCEEDED");
        setState("INPUT_RANGES_READ");

        QString detail;
        if (!m_evdev->validateMapping(&detail)) {
            fail("COORD_MAPPING_FAILED: " + detail);
            return;
        }

        connect(m_evdev, &EvdevMarkerSource::firstContact,
                this, &LiveInkController::onFirstContact);

        drawStatusPage(true);
        PerfLog::instance().log("READY_PAGE_UPDATE_REQUEST");
        PerfLog::instance().log("READY_PAGE_PAINT_EVENT_BEGIN");
        swapRect(QRect(0, 0, kScreenW, kScreenH), m_pageMode, EPFramebuffer::CompleteRefresh);
        PerfLog::instance().log("READY_PAGE_PAINT_EVENT_END");

        if (g_inkGoldBuffer->save(kReadyScreenshotPath)) {
            PerfLog::instance().log("READY_SCREENSHOT_SAVED", {{"path", kReadyScreenshotPath}});
        } else {
            PerfLog::instance().log("READY_SCREENSHOT_FAILED", {{"path", kReadyScreenshotPath}});
        }
        setState("DISPLAY_READY");
        goLive();
    }

    void goLive() {
        // Both LIVE_READY conditions hold here: READY_PAGE_PAINT_EVENT_END
        // has been logged and EVIOCGRAB succeeded during initMarker(). Only
        // now does the user's session clock start.
        m_sessionClock.start();
        m_timerStarted = true;
        m_evdev->setAcceptInput(true);
        setState("LIVE_READY");
        PerfLog::instance().log("SESSION_TIMER_STARTED", {{"duration_s", m_durationS}});

        m_sessionTimer = new QTimer(this);
        m_sessionTimer->setSingleShot(true);
        connect(m_sessionTimer, &QTimer::timeout, this, [this]() { complete("duration elapsed"); });
        m_sessionTimer->start(m_durationS * 1000);
    }

    void onFirstContact() {
        if (m_firstContact) return;
        m_firstContact = true;
        if (m_state == "LIVE_READY") setState("TEST_RUNNING");

        // One-shot diagnostic header; drawn once, never repainted afterwards.
        {
            QPainter p(g_inkGoldBuffer);
            p.fillRect(kContactIndicatorRect, Qt::white);
            QFont f;
            f.setPixelSize(32);
            f.setBold(true);
            p.setFont(f);
            p.setPen(Qt::black);
            p.drawText(kContactIndicatorRect, Qt::AlignLeft | Qt::AlignVCenter, "INPUT RECEIVED");
        }
        swapRect(kContactIndicatorRect, m_pageMode, EPFramebuffer::NoRefresh);
        PerfLog::instance().log("FIRST_PAINT_EVENT");
    }

    void complete(const QString& why) {
        if (m_completing) return;
        m_completing = true;
        PerfLog::instance().log("TEST_COMPLETE_TRIGGER", {{"reason", why}});
        setState("TEST_COMPLETE");
        if (g_inkGoldBuffer) g_inkGoldBuffer->save(kFinalScreenshotPath);
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

    // QCoreApplication::exit() is a no-op before exec() starts; a queued
    // zero-timer works both before and during the event loop.
    void exitApp(int code) {
        QTimer::singleShot(0, [code]() { QCoreApplication::exit(code); });
    }

    void releaseMarker() {
        if (m_evdev) {
            m_evdev->setAcceptInput(false);
            delete m_evdev; // destructor releases EVIOCGRAB and closes the fd
            m_evdev = nullptr;
        }
    }

    void setState(const QString& s) {
        m_state = s;
        PerfLog::instance().log("STATE", {{"state", s}});
        qWarning("STATE %s", s.toUtf8().constData());
    }

    void readBuildInfo() {
        QFile f("/tmp/paperos-test-driver/env.json");
        if (f.open(QIODevice::ReadOnly)) {
            const QJsonObject env = QJsonDocument::fromJson(f.readAll()).object();
            m_sha = env["ACTIVE_SHA256"].toString();
            m_buildId = env["ACTIVE_BUILD_ID"].toString();
        }
        if (m_sha.isEmpty()) m_sha = qEnvironmentVariable("PAPEROS_BUILD_SHA", "unknown");
        if (m_buildId.isEmpty()) m_buildId = "unknown";
    }

    QString shortBuild() const {
        return m_sha.length() > 12 ? m_sha.left(12) : m_sha;
    }

    void drawStatusPage(bool ready) {
        QPainter p(g_inkGoldBuffer);
        p.fillRect(g_inkGoldBuffer->rect(), Qt::white);
        p.setPen(Qt::black);

        // Border frame: proves a page transition on the panel even if font
        // resolution fails and no text rasterizes.
        p.fillRect(QRect(8, 8, kScreenW - 16, 4), Qt::black);
        p.fillRect(QRect(8, kScreenH - 12, kScreenW - 16, 4), Qt::black);
        p.fillRect(QRect(8, 8, 4, kScreenH - 16), Qt::black);
        p.fillRect(QRect(kScreenW - 12, 8, 4, kScreenH - 16), Qt::black);

        QFont title;
        title.setPixelSize(56);
        title.setBold(true);
        p.setFont(title);
        p.drawText(QRect(0, 120, kScreenW, 80), Qt::AlignHCenter, "PAPEROS INK TEST");

        QFont body;
        body.setPixelSize(34);
        p.setFont(body);
        const QString status = ready ? "READY" : "INITIALIZING";
        QStringList lines = {
            "Marker: " + status,
            "Display: " + status,
            "Build: " + shortBuild(),
            QStringLiteral("Duration: %1 seconds").arg(m_durationS),
            "",
            ready ? "Write anywhere below" : "Please wait...",
        };
        int y = 260;
        for (const QString& line : lines) {
            p.drawText(QRect(0, y, kScreenW, 50), Qt::AlignHCenter, line);
            y += 56;
        }
        if (ready) {
            p.fillRect(QRect(60, y + 30, kScreenW - 120, 3), Qt::black);
        }
    }

    QJsonObject stateJson() const {
        const int remaining = m_timerStarted
            ? qMax(0, m_durationS - int(m_sessionClock.elapsed() / 1000))
            : m_durationS;
        QJsonObject o;
        o["live"] = m_state;
        o["failure"] = m_failure;
        o["pid"] = int(getpid());
        o["sha"] = m_sha;
        o["build"] = shortBuild();
        o["durationS"] = m_durationS;
        o["remainingS"] = remaining;
        o["timerStarted"] = m_timerStarted;
        o["markerGrabbed"] = m_evdev ? m_evdev->grabbed() : false;
        o["markerDevice"] = m_markerDevice;
        o["firstContact"] = m_firstContact;
        o["displayPath"] = "direct-epframebuffer";
        o["softwareDisplayReady"] = (m_state == "LIVE_READY" || m_state == "TEST_RUNNING"
                                     || m_state == "TEST_COMPLETE");
        o["physicalDisplayVisible"] = "pending_user_confirmation";
        o["readyScreenshot"] = kReadyScreenshotPath;
        return o;
    }

    QString m_state = "PROCESS_STARTED";
    QString m_failure;
    QString m_sha;
    QString m_buildId;
    QString m_markerDevice;
    int m_durationS = 120;
    bool m_timerStarted = false;
    bool m_firstContact = false;
    bool m_completing = false;
    EPScreenMode m_liveMode = EPScreenMode::QualityFastest;
    EPScreenMode m_pageMode = EPScreenMode::Quality3;
    QElapsedTimer m_sessionClock;
    QTimer* m_sessionTimer = nullptr;
    EvdevMarkerSource* m_evdev = nullptr;
    LiveTestBridge* m_bridge = nullptr;
};

static int g_sigPipe[2] = {-1, -1};

static void liveSignalHandler(int) {
    const char c = 1;
    ssize_t ignored = write(g_sigPipe[1], &c, 1);
    (void)ignored;
}

int main(int argc, char* argv[]) {
    // Arm framebuffer-candidate capture BEFORE Qt constructs anything, so the
    // vendor QImage ctors run under the interposers whether they happen during
    // platform-plugin init or inside EPFramebuffer::instance().
    DirectInkDiag::armCapture();

    qputenv("QT_QPA_PLATFORM", "epaper");
    QGuiApplication app(argc, argv);

    // ASCII-safe insurance: the shell ships this font; the status pages are
    // ASCII-only but an empty fontconfig set would otherwise draw no text.
    QFontDatabase::addApplicationFont("/home/root/paperos/fonts/NotoSansCJKsc-Regular.otf");

    LiveInkController controller;

    if (pipe(g_sigPipe) == 0) {
        fcntl(g_sigPipe[0], F_SETFL, O_NONBLOCK);
        fcntl(g_sigPipe[1], F_SETFL, O_NONBLOCK);
        std::signal(SIGINT, liveSignalHandler);
        std::signal(SIGTERM, liveSignalHandler);
        auto* notifier = new QSocketNotifier(g_sigPipe[0], QSocketNotifier::Read, &app);
        QObject::connect(notifier, &QSocketNotifier::activated, [&controller]() {
            char buf[16];
            while (read(g_sigPipe[0], buf, sizeof(buf)) > 0) {}
            controller.shutdownFromSignal();
        });
    }

    quint16 port = quint16(qEnvironmentVariableIntValue("PAPEROS_TEST_BRIDGE_PORT"));
    if (port == 0) port = 18765;
    controller.startBridge(port);
    controller.begin();

    return app.exec();
}

#include "main_live.moc"
