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
#include "ApiClient.h"
#include "ActionQueue.h"
#include "DeviceStatus.h"
#include "InkCanvasItem.h"
#include "NoteStore.h"
#include "PenInputService.h"
#include "RefreshController.h"

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
    // The reMarkable Paper Pro (chiappa) uses the "epaper" platform plugin.
    // This can be set via environment variable QT_QPA_PLATFORM=epaper or in code.
    qputenv("QT_QPA_PLATFORM", "epaper");

    QGuiApplication app(argc, argv);

    const QString cjkFamily = loadPaperOsFont();
    if (!cjkFamily.isEmpty())
        app.setFont(QFont(cjkFamily));

    ApiClient apiClient;
    ActionQueue actionQueue;
    DeviceStatus deviceStatus;
    NoteStore noteStore;
    RefreshController refreshControl;
    PenInputService penBridge;

    // Shared look tokens for every QML file. A context property (not a QML
    // singleton) because the module's files live in a qml/ subdirectory,
    // where the implicit directory import shadows module-qmldir singletons.
    // Sizes are physical pixels on the 954x1696 @ 264 PPI Move panel:
    // ~94px = the 9mm minimum touch target, ~38px = 10.5pt body text.
    QVariantMap ui{
        {"fontFamily", cjkFamily.isEmpty() ? QGuiApplication::font().family() : cjkFamily},
        // layout
        {"pageMargin", 40}, {"gap", 20}, {"cardPadding", 28}, {"radius", 12},
        // type scale
        {"fontTitle", 44},   // app mark
        {"fontClock", 88},   // home clock
        {"fontFocus", 46},   // focus / now primary line
        {"fontSection", 32}, // page + section titles
        {"fontBody", 38},    // task and list body (incl. CJK)
        {"fontMeta", 26},    // secondary / meta
        {"fontFooter", 22},  // footers only
        // tap targets
        {"tabBarHeight", 120}, {"buttonHeight", 72}, {"buttonHeightSmall", 60},
        {"checkboxSize", 64},
        // e-ink grayscale: no information may rely on light gray alone
        {"paper", "#FFFFFF"},        // pure paper white
        {"card", "#FFFFFF"},
        {"ink", "#111111"},          // primary text
        {"inkSecondary", "#333333"}, // secondary body
        {"mutedInk", "#4D4D4D"},     // meta, never below mid-gray
        {"faintInk", "#767676"},     // disabled / empty states only
        {"line", "#999999"},         // subtle border
        {"lineStrong", "#111111"},   // primary card border
        {"accent", "#7A1F2B"},       // status + active emphasis only
    };

    qmlRegisterType<InkCanvasItem>("PaperOS", 1, 0, "InkCanvasItem");

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("Ui", ui);
    engine.rootContext()->setContextProperty("apiClient", &apiClient);
    engine.rootContext()->setContextProperty("actionQueue", &actionQueue);
    engine.rootContext()->setContextProperty("deviceStatus", &deviceStatus);
    engine.rootContext()->setContextProperty("noteStore", &noteStore);
    engine.rootContext()->setContextProperty("refreshControl", &refreshControl);
    engine.rootContext()->setContextProperty("penBridge", &penBridge);
    engine.rootContext()->setContextProperty("appFontFamily", cjkFamily);

    const QUrl url(u"qrc:/qt/qml/PaperOSApp/qml/Main.qml"_qs);
    QObject::connect(
        &engine,
        &QQmlApplicationEngine::objectCreationFailed,
        &app,
        []() { QCoreApplication::exit(-1); },
        Qt::QueuedConnection);
    engine.load(url);

    if (!engine.rootObjects().isEmpty()) {
        if (auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()))
            penBridge.setWindow(window);
    }

    return app.exec();
}
