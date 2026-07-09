#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QSurfaceFormat>
#include <QQmlContext>
#include "ApiClient.h"

int main(int argc, char *argv[])
{
    // The reMarkable Paper Pro (chiappa) uses the "epaper" platform plugin.
    // This can be set via environment variable QT_QPA_PLATFORM=epaper or in code.
    qputenv("QT_QPA_PLATFORM", "epaper");

    QGuiApplication app(argc, argv);

    ApiClient apiClient;

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("apiClient", &apiClient);

    const QUrl url(u"qrc:/qt/qml/PlannerOS/qml/Main.qml"_qs);
    QObject::connect(
        &engine,
        &QQmlApplicationEngine::objectCreationFailed,
        &app,
        []() { QCoreApplication::exit(-1); },
        Qt::QueuedConnection);
    engine.load(url);

    return app.exec();
}
