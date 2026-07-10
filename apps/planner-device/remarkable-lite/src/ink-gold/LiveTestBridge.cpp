#include "LiveTestBridge.h"
#include <QTcpSocket>
#include <QJsonDocument>

LiveTestBridge::LiveTestBridge(QObject* parent) : QObject(parent) {
    connect(&m_server, &QTcpServer::newConnection, this, &LiveTestBridge::onNewConnection);
}

bool LiveTestBridge::start(quint16 port) {
    return m_server.listen(QHostAddress::LocalHost, port);
}

void LiveTestBridge::onNewConnection() {
    while (QTcpSocket* socket = m_server.nextPendingConnection()) {
        socket->setParent(this);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket]() {
            QByteArray data = socket->readAll().trimmed();
            QJsonDocument doc = QJsonDocument::fromJson(data);
            if (!doc.isObject()) return;
            const QJsonObject cmd = doc.object();
            const QString commandStr = cmd["cmd"].toString();

            QJsonObject response;
            response["ok"] = true;

            if (commandStr == "ping") {
                response["pong"] = true;
            } else if (commandStr == "state") {
                if (m_stateProvider) response["state"] = m_stateProvider();
            } else if (commandStr == "screenshot") {
                const QString path = cmd["path"].toString("/tmp/paperos-test-screenshot.png");
                const bool saved = m_screenshotHandler && m_screenshotHandler(path);
                response["ok"] = saved;
                response["path"] = path;
                if (!saved) response["error"] = "screenshot failed";
            } else if (commandStr == "stop") {
                response["stopping"] = true;
                if (m_stopHandler) m_stopHandler();
            } else {
                response["ok"] = false;
                response["error"] = "unknown command: " + commandStr;
            }

            socket->write(QJsonDocument(response).toJson(QJsonDocument::Compact));
            socket->write("\n");
            socket->flush();
            socket->disconnectFromHost();
        });
        connect(socket, &QTcpSocket::disconnected, socket, &QTcpSocket::deleteLater);
    }
}
