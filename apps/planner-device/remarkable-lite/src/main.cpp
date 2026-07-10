#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QSurfaceFormat>
#include <QQmlContext>
#include <QDir>
#include <QFont>
#include <QFontDatabase>
#include <QDebug>
#include "ApiClient.h"

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

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("apiClient", &apiClient);
    engine.rootContext()->setContextProperty("appFontFamily", cjkFamily);

    const QUrl url(u"qrc:/qt/qml/PaperOSApp/qml/Main.qml"_qs);
    QObject::connect(
        &engine,
        &QQmlApplicationEngine::objectCreationFailed,
        &app,
        []() { QCoreApplication::exit(-1); },
        Qt::QueuedConnection);
    engine.load(url);

    return app.exec();
}
