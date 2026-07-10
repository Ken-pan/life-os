#pragma once
#include <QObject>
#include <QTcpServer>
#include <QJsonObject>
#include <functional>

// Line-delimited JSON command server for the live-ink candidate, matching the
// paperctl bridge protocol: one JSON object in, one JSON object out, close.
// Commands: ping, state, screenshot {path}, stop.
class LiveTestBridge : public QObject {
    Q_OBJECT
public:
    using StateProvider = std::function<QJsonObject()>;
    using StopHandler = std::function<void()>;
    using ScreenshotHandler = std::function<bool(const QString& path)>;

    explicit LiveTestBridge(QObject* parent = nullptr);
    bool start(quint16 port);

    void setStateProvider(StateProvider fn) { m_stateProvider = std::move(fn); }
    void setStopHandler(StopHandler fn) { m_stopHandler = std::move(fn); }
    void setScreenshotHandler(ScreenshotHandler fn) { m_screenshotHandler = std::move(fn); }

private slots:
    void onNewConnection();

private:
    QTcpServer m_server;
    StateProvider m_stateProvider;
    StopHandler m_stopHandler;
    ScreenshotHandler m_screenshotHandler;
};
