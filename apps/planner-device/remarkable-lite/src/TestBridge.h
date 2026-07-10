#pragma once

#include <QObject>
#include <QPointer>
#include <QTcpServer>
#include <QJsonObject>

class QQuickItem;
class QQuickWindow;
class QTcpSocket;
template <typename T> class QSet;

// Debug-only PaperOS test bridge. Enabled only with PAPEROS_TEST_BRIDGE=1 and
// bound to 127.0.0.1 so host tools reach it through SSH forwarding.
class TestBridge : public QObject
{
    Q_OBJECT

public:
    explicit TestBridge(QObject *parent = nullptr);

    bool maybeStart(QQuickWindow *window);

private slots:
    void onNewConnection();

private:
    QJsonObject handleCommand(const QJsonObject &command);
    QJsonObject stateObject() const;
    QJsonObject treeObject() const;
    QJsonObject nodeObject(QObject *object) const;
    void collectNodes(QObject *object, QJsonArray &nodes, QSet<QObject *> &visited) const;
    QObject *findObjectByName(const QString &name) const;
    QObject *findObjectByName(QObject *object, const QString &name, QSet<QObject *> &visited) const;
    bool tapObject(const QString &name, QString *error);
    bool saveScreenshot(const QString &path, QString *error) const;
    void writeResponse(QTcpSocket *socket, const QJsonObject &response) const;

    QPointer<QQuickWindow> m_window;
    QTcpServer m_server;
};
