#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QSurfaceFormat>
#include <QQmlContext>
#include <QDir>
#include <QFont>
#include <QFontDatabase>
#include <QDebug>
#include <QtQml/qqml.h>
#include <QTimer>
#include "ApiClient.h"
#include "epframebuffer.h"
#include "ActionQueue.h"
#include "DeviceStatus.h"
#include "InkCanvasItem.h"
#include "InkModeController.h"
#include "NoteStore.h"
#include "PenInputService.h"
#include "RefreshController.h"
#include "TestBridge.h"
#include "PerfLog.h"

// Load the first usable font from PAPEROS_FONT_DIR (default
// /home/root/paperos/fonts). Returns the family name, or an empty
// string when no font could be loaded — callers must keep working
// with the platform default font in that case.
static QString loadPaperOsFont()
{
    const QString fontDir =
        qEnvironmentVariable("PAPEROS_FONT_DIR", QStringLiteral("/home/root/paperos/fonts"));
    const QStringList candidates =
        QDir(fontDir).entryList({QStringLiteral("*.otf"), QStringLiteral("*.ttf"),
                                 QStringLiteral("*.otc"), QStringLiteral("*.ttc")},
                                QDir::Files, QDir::Name);
    for (const QString &fileName : candidates) {
        const QString path = fontDir + QLatin1Char('/') + fileName;
        const int fontId = QFontDatabase::addApplicationFont(path);
        if (fontId < 0) {
            qWarning() << "PaperOS: failed to load font" << path;
            continue;
        }
        const QStringList families = QFontDatabase::applicationFontFamilies(fontId);
        if (families.isEmpty()) {
            qWarning() << "PaperOS: no families in font" << path;
            continue;
        }
        qInfo() << "PaperOS: loaded font" << families.first() << "from" << path;
        return families.first();
    }
    qWarning() << "PaperOS: no usable font in" << fontDir << "- using platform default";
    return QString();
}

int main(int argc, char *argv[])
{
    PerfLog::instance().log("APP_PROCESS_START");

    // The reMarkable Paper Pro (chiappa) uses the "epaper" platform plugin.
    // This can be set via environment variable QT_QPA_PLATFORM=epaper or in code.
    qputenv("QT_QPA_PLATFORM", "epaper");

    // Phase 2B-0 direct-ink diagnostics. No-op unless PAPEROS_DIRECT_DIAG=1;
    // arms the framebuffer interposers before the platform plugin loads.
    DirectInkDiag::install();
    // Native ink mode resolves the vendor framebuffer in-process, so
    // candidate capture is always armed before the platform plugin runs.
    DirectInkDiag::armCapture();

    QGuiApplication app(argc, argv);

    const QString cjkFamily = loadPaperOsFont();
    if (!cjkFamily.isEmpty())
        app.setFont(QFont(cjkFamily));

    ApiClient apiClient;
    ActionQueue actionQueue;
    DeviceStatus deviceStatus;
    NoteStore noteStore;
    InkModeController inkModeController;
    RefreshController refreshControl;
    PenInputService penBridge;
    TestBridge testBridge;

    // ── Design tokens ──────────────────────────────────────────────
    // Physical pixels on the 954 × 1696 @ 264 PPI Move panel.
    // Three font-size presets: S / M / L, selected by env PAPEROS_SCALE.
    // M is the default. All tap targets are fixed (≥ 6 mm physical).

    const QString scaleEnv =
        qEnvironmentVariable("PAPEROS_SCALE", QStringLiteral("M")).toUpper();

    // Font scale tables: {homeTime, section, primary, task, meta, button, footer}
    struct Scale { int homeTime, section, primary, task, meta, button, footer; };
    Scale s;
    if (scaleEnv == QLatin1String("S"))
        s = {72, 28, 42, 36, 24, 24, 20};
    else if (scaleEnv == QLatin1String("L"))
        s = {108, 38, 56, 50, 32, 32, 28};
    else // M (default)
        s = {88, 32, 48, 42, 28, 28, 24};

    qInfo() << "PaperOS: scale" << scaleEnv
            << "task" << s.task << "meta" << s.meta;

    QVariantMap ui{
        {"fontFamily", cjkFamily.isEmpty() ? QGuiApplication::font().family() : cjkFamily},
        {"scale", scaleEnv},
        // layout – generous margins, no rounded-rect radius
        {"pageMargin", 48}, {"gap", 24},
        // type scale (physical px at 264 PPI)
        {"homeTime",  s.homeTime},   // clock on Home
        {"section",   s.section},    // section labels (NOW, FOCUS, …)
        {"primary",   s.primary},    // focus / hero text
        {"task",      s.task},       // task body & CJK
        {"meta",      s.meta},       // secondary info
        {"button",    s.button},     // button labels
        {"footer",    s.footer},     // status footer
        // tap targets (fixed across scales)
        {"tabH", 96}, {"btnH", 80}, {"btnHs", 64}, {"cbSize", 56},
        // ── P-MOVE-UI system language (slice 1) ────────────────────
        // Four grayscale tokens only (brief §4.2). The panel is
        // monochrome; mid grays must sit far apart to survive
        // quantization, so no 5–15% steps.
        //   ink100  current selection, primary text, primary action
        //   ink70   normal text, icons, secondary controls
        //   ink30   dividers, disabled state, inactive metadata
        //   paper   canvas and paper surfaces
        // State semantics (brief §8) for migrated components:
        //   current  = ink100 bold + 4px underline / left bar
        //   selected = reverse fill (ink100 surface, paper glyph)
        //   pressed  = temporary reverse fill while touched
        //   focus    = thin ink100 outline (input focus only)
        //   disabled = ink30
        {"ink100", "#000000"},
        {"ink70",  "#555555"},
        {"ink30",  "#B0B0AC"},
        // legacy three stops — kept for pages not yet migrated
        {"paper",   "#FFFFFF"},
        {"ink",     "#000000"},
        {"muted",   "#555555"},
        {"divider", "#000000"},
    };

    qmlRegisterType<InkCanvasItem>("PaperOS", 1, 0, "InkCanvasItem");

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("Ui", ui);
    engine.rootContext()->setContextProperty("apiClient", &apiClient);
    engine.rootContext()->setContextProperty("actionQueue", &actionQueue);
    engine.rootContext()->setContextProperty("deviceStatus", &deviceStatus);
    engine.rootContext()->setContextProperty("noteStore", &noteStore);
    engine.rootContext()->setContextProperty("inkMode", &inkModeController);
    engine.rootContext()->setContextProperty("refreshControl", &refreshControl);
    engine.rootContext()->setContextProperty("penBridge", &penBridge);
    engine.rootContext()->setContextProperty("perfLog", &PerfLog::instance());
    engine.rootContext()->setContextProperty("appFontFamily", cjkFamily);

    const QUrl url(u"qrc:/qt/qml/PaperOSApp/qml/Main.qml"_qs);
    QObject::connect(
        &engine,
        &QQmlApplicationEngine::objectCreationFailed,
        &app,
        []() { QCoreApplication::exit(-1); },
        Qt::QueuedConnection);
    PerfLog::instance().log("QML_LOAD_BEGIN");
    engine.load(url);
    PerfLog::instance().log("QML_LOAD_END");

    if (!engine.rootObjects().isEmpty()) {
        if (auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first())) {
            penBridge.setWindow(window);
            testBridge.maybeStart(window);
            PerfLog::instance().log("BRIDGE_READY");
        }
    }

    // Run the direct-ink startup gate after the platform has shown the window
    // and the vendor has registered its buffers (setBuffers). Diagnostic only.
    if (qEnvironmentVariableIntValue("PAPEROS_DIRECT_DIAG") == 1) {
        fprintf(stderr, "[DirectDiag] gate scheduled (T+900ms)\n");
        QTimer::singleShot(900, &app, [argc, argv]() {
            fprintf(stderr, "[DirectDiag] gate callback entered\n");
            DirectInkDiag::runStartupGate(argc, argv);

            // Test-A HOLD: re-assert the deterministic line every 500 ms so
            // the operator can judge physical solid-vs-dotted while the shell
            // repaints. Purely diagnostic; PAPEROS_DIRECT_TESTA=1 only.
            if (qEnvironmentVariableIntValue("PAPEROS_DIRECT_TESTA") == 1
                && DirectInkDiag::ready()) {
                auto *hold = new QTimer(qApp);
                QObject::connect(hold, &QTimer::timeout, []() { DirectInkDiag::runTestAHold(); });
                hold->start(500);
                fprintf(stderr, "[DirectDiag] Test-A hold active (line at mid-screen)\n");
            }
        });
    }

    return app.exec();
}
